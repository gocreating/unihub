"""Views for data_io import/export endpoints."""

from __future__ import annotations

import datetime

from django.http import HttpResponse
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from data_io.registry import get_registry, get_table, topo_sort
from data_io.serializers import (
    BatchImportPreviewRequestSerializer,
    ExportRequestSerializer,
    ImportConfirmRequestSerializer,
    ImportConfirmResponseSerializer,
    ImportPreviewRequestSerializer,
    ImportPreviewResponseSerializer,
    TableImportConfirmSerializer,
    TableImportPreviewSerializer,
    TableInfoSerializer,
    ZipImportRequestSerializer,
)
from data_io.services.csv_exporter import export_table, export_tables


class TablesView(APIView):
    """GET /api/v1/io/tables/ — list all registered tables with field schemas."""

    def get(self, request: Request) -> Response:
        from django.contrib.contenttypes.models import ContentType

        from core.models import AttributeDefinition

        registry = get_registry()
        table_data = []

        for label, descriptor in registry.items():
            fields: list[dict] = []
            for sf in descriptor.system_fields:
                fields.append(
                    {
                        "csv_header": sf.csv_header,
                        "data_type": sf.data_type,
                        "is_system": True,
                        "is_pk": sf.is_pk,
                    }
                )
            if descriptor.has_user_attributes:
                app_label, model_name = label.split(".")
                try:
                    ct = ContentType.objects.get(app_label=app_label, model=model_name)
                    for ad in AttributeDefinition.objects.filter(
                        content_type=ct, is_system=False
                    ).order_by("display_order", "name"):
                        fields.append(
                            {
                                "csv_header": f"[{ad.name}]:{ad.data_type}",
                                "data_type": ad.data_type,
                                "is_system": False,
                                "is_pk": False,
                            }
                        )
                except ContentType.DoesNotExist:
                    pass

            table_data.append(
                {
                    "content_type_label": label,
                    "display_name": descriptor.display_name,
                    "fields": fields,
                    "depends_on": descriptor.depends_on,
                }
            )

        serializer = TableInfoSerializer(table_data, many=True)
        return Response(serializer.data)


class ExportView(APIView):
    """POST /api/v1/io/export/ — export one or more tables as CSV or ZIP."""

    def post(self, request: Request) -> HttpResponse:
        serializer = ExportRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        tables: list[str] = serializer.validated_data["tables"]
        fmt: str = serializer.validated_data["format"]

        try:
            descriptors = [get_table(label) for label in tables]
        except KeyError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        if fmt == "csv":
            descriptor = descriptors[0]
            csv_bytes = export_table(descriptor)
            filename = f"{descriptor.content_type_label.replace('.', '_')}.csv"
            response = HttpResponse(csv_bytes, content_type="text/csv; charset=utf-8")
            response["Content-Disposition"] = f'attachment; filename="{filename}"'
            return response
        else:
            zip_bytes = export_tables(descriptors)
            now = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"unihub-export-{now}.zip"
            response = HttpResponse(zip_bytes, content_type="application/zip")
            response["Content-Disposition"] = f'attachment; filename="{filename}"'
            return response


class ImportPreviewView(APIView):
    """POST /api/v1/io/import/preview/ — parse CSV and return change diff (no writes)."""

    def post(self, request: Request) -> Response:
        serializer = ImportPreviewRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        table_label: str = serializer.validated_data["table"]
        mode: str = serializer.validated_data["mode"]
        csv_text: str = serializer.validated_data.get("csv_text", "")
        csv_file = serializer.validated_data.get("csv_file")

        try:
            descriptor = get_table(table_label)
        except KeyError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        if csv_file is not None:
            csv_text = csv_file.read().decode("utf-8")

        from data_io.services.change_preview import compute_diff
        from data_io.services.csv_importer import parse_csv

        parsed_rows, errors = parse_csv(csv_text, descriptor)

        if errors:
            response_data = {
                "table": table_label,
                "mode": mode,
                "total_rows_in_csv": 0,
                "total_rows_in_db": descriptor.model_class.objects.count(),
                "creates": [],
                "updates": [],
                "deletes": [],
                "errors": [{"row": e.row, "column": e.column, "message": e.message} for e in errors],
            }
            return Response(ImportPreviewResponseSerializer(response_data).data)

        change_records = compute_diff(parsed_rows, descriptor, mode)

        creates = [r for r in change_records if r["operation"] == "create"]
        updates = [r for r in change_records if r["operation"] == "update"]
        deletes = [r for r in change_records if r["operation"] == "delete"]

        response_data = {
            "table": table_label,
            "mode": mode,
            "total_rows_in_csv": len(parsed_rows),
            "total_rows_in_db": descriptor.model_class.objects.count(),
            "creates": creates,
            "updates": updates,
            "deletes": deletes,
            "errors": [],
        }
        return Response(ImportPreviewResponseSerializer(response_data).data)


class ImportConfirmView(APIView):
    """POST /api/v1/io/import/confirm/ — apply import diff inside transaction.atomic."""

    def post(self, request: Request) -> Response:
        serializer = ImportConfirmRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        table_label: str = serializer.validated_data["table"]
        mode: str = serializer.validated_data["mode"]
        csv_text: str = serializer.validated_data.get("csv_text", "")
        csv_file = serializer.validated_data.get("csv_file")

        try:
            descriptor = get_table(table_label)
        except KeyError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        if csv_file is not None:
            csv_text = csv_file.read().decode("utf-8")

        from data_io.services.change_preview import apply_diff, compute_diff
        from data_io.services.csv_importer import parse_csv

        parsed_rows, errors = parse_csv(csv_text, descriptor)

        if errors:
            return Response(
                {"errors": [{"row": e.row, "column": e.column, "message": e.message} for e in errors]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        change_records = compute_diff(parsed_rows, descriptor, mode)
        result = apply_diff(change_records, descriptor, mode)

        response_data = {
            "table": table_label,
            "mode": mode,
            "created": result["created"],
            "updated": result["updated"],
            "deleted": result["deleted"],
        }
        return Response(ImportConfirmResponseSerializer(response_data).data)


def _parse_zip_tables(zip_file, mode: str) -> list[dict]:
    """Extract CSVs from an uploaded ZIP and return per-table parse+diff results."""
    import io as _io
    import zipfile as _zipfile

    from data_io.registry import get_registry
    from data_io.services.change_preview import compute_diff
    from data_io.services.csv_exporter import _zip_entry_name
    from data_io.services.csv_importer import parse_csv

    zip_bytes = zip_file.read()
    registry = get_registry()
    results = []

    try:
        zf = _zipfile.ZipFile(_io.BytesIO(zip_bytes))
    except _zipfile.BadZipFile:
        return []

    zip_names = set(zf.namelist())
    with zf:
        for label, descriptor in registry.items():
            entry = _zip_entry_name(label)
            if entry not in zip_names:
                continue
            try:
                csv_text = zf.read(entry).decode("utf-8")
            except Exception:
                continue
            rows, errors = parse_csv(csv_text, descriptor)
            if errors:
                results.append(
                    {
                        "table_label": label,
                        "display_name": descriptor.display_name,
                        "creates": [],
                        "updates": [],
                        "deletes": [],
                        "errors": [
                            {"row": e.row, "column": e.column, "message": e.message}
                            for e in errors
                        ],
                    }
                )
            else:
                change_records = compute_diff(rows, descriptor, mode)
                results.append(
                    {
                        "table_label": label,
                        "display_name": descriptor.display_name,
                        "creates": [r for r in change_records if r["operation"] == "create"],
                        "updates": [r for r in change_records if r["operation"] == "update"],
                        "deletes": [r for r in change_records if r["operation"] == "delete"],
                        "errors": [],
                        "_rows": rows,
                        "_change_records": change_records,
                    }
                )

    return results


class ImportZipPreviewView(APIView):
    """POST /api/v1/io/import/zip/preview/ — preview all tables in a ZIP (no writes)."""

    def post(self, request: Request) -> Response:
        serializer = ZipImportRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        mode: str = serializer.validated_data["mode"]
        zip_file = serializer.validated_data["zip_file"]

        results = _parse_zip_tables(zip_file, mode)
        if not results:
            return Response(
                {"detail": "No recognized tables found in ZIP."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(TableImportPreviewSerializer(results, many=True).data)


class ImportZipConfirmView(APIView):
    """POST /api/v1/io/import/zip/confirm/ — apply all tables in a ZIP inside one transaction."""

    def post(self, request: Request) -> Response:
        from django.db import transaction

        from data_io.registry import get_registry
        from data_io.services.change_preview import apply_diff

        serializer = ZipImportRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        mode: str = serializer.validated_data["mode"]
        zip_file = serializer.validated_data["zip_file"]

        results = _parse_zip_tables(zip_file, mode)
        if not results:
            return Response(
                {"detail": "No recognized tables found in ZIP."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        any_errors = any(r["errors"] for r in results)
        if any_errors:
            return Response(
                {"detail": "ZIP contains validation errors. Fix them before confirming."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        sorted_labels = topo_sort([r["table_label"] for r in results])
        label_to_result = {r["table_label"]: r for r in results}
        results = [label_to_result[lbl] for lbl in sorted_labels if lbl in label_to_result]

        registry = get_registry()
        confirm_results = []

        with transaction.atomic():
            for result in results:
                label = result["table_label"]
                descriptor = registry[label]
                counts = apply_diff(result["_change_records"], descriptor, mode)
                confirm_results.append(
                    {
                        "table_label": label,
                        "display_name": result["display_name"],
                        "created": counts["created"],
                        "updated": counts["updated"],
                        "deleted": counts["deleted"],
                    }
                )

        return Response(TableImportConfirmSerializer(confirm_results, many=True).data)


class ImportBatchPreviewView(APIView):
    """POST /api/v1/io/import/batch-preview/ — preview multiple tables in topo order.

    Accepts a list of {table, csv_text|csv_file} entries. Tables are processed in
    topological dependency order; PKs collected from each table are passed as
    allowed_fk_pks to subsequent tables so cross-CSV FK references validate correctly.
    """

    def post(self, request: Request) -> Response:
        from data_io.registry import get_registry, topo_sort
        from data_io.services.change_preview import compute_diff
        from data_io.services.csv_importer import parse_csv

        serializer = BatchImportPreviewRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        mode: str = serializer.validated_data["mode"]
        table_entries: list[dict] = serializer.validated_data["tables"]

        registry = get_registry()

        # Build a map from label → csv_text
        csv_map: dict[str, str] = {}
        for entry in table_entries:
            label = entry["table"]
            csv_file = entry.get("csv_file")
            csv_text = entry.get("csv_text", "")
            if csv_file is not None:
                csv_text = csv_file.read().decode("utf-8")
            csv_map[label] = csv_text

        # Validate all labels are registered
        unknown = [lbl for lbl in csv_map if lbl not in registry]
        if unknown:
            return Response(
                {"detail": f"Unknown table(s): {', '.join(unknown)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        sorted_labels = topo_sort(list(csv_map.keys()))

        # allowed_fk_pks accumulates PKs as each table is processed
        allowed_fk_pks: dict[str, set[str]] = {}
        results = []

        for label in sorted_labels:
            descriptor = registry[label]
            csv_text = csv_map[label]

            rows, errors = parse_csv(csv_text, descriptor, allowed_fk_pks=allowed_fk_pks)

            if errors:
                results.append(
                    {
                        "table_label": label,
                        "display_name": descriptor.display_name,
                        "creates": [],
                        "updates": [],
                        "deletes": [],
                        "errors": [
                            {"row": e.row, "column": e.column, "message": e.message}
                            for e in errors
                        ],
                    }
                )
            else:
                # Collect PKs from this batch so downstream tables can reference them
                pk_field = next((f for f in descriptor.system_fields if f.is_pk), None)
                if pk_field:
                    pks = {row[pk_field.csv_header] for row in rows if row.get(pk_field.csv_header)}
                    allowed_fk_pks[label] = allowed_fk_pks.get(label, set()) | pks

                change_records = compute_diff(rows, descriptor, mode)
                results.append(
                    {
                        "table_label": label,
                        "display_name": descriptor.display_name,
                        "creates": [r for r in change_records if r["operation"] == "create"],
                        "updates": [r for r in change_records if r["operation"] == "update"],
                        "deletes": [r for r in change_records if r["operation"] == "delete"],
                        "errors": [],
                    }
                )

        return Response(TableImportPreviewSerializer(results, many=True).data)
