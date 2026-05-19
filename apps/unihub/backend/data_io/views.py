"""Views for data_io import/export endpoints."""

from __future__ import annotations

import datetime

from django.http import HttpResponse
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from data_io.registry import get_registry, get_table
from data_io.serializers import (
    ExportRequestSerializer,
    ImportConfirmRequestSerializer,
    ImportConfirmResponseSerializer,
    ImportPreviewRequestSerializer,
    ImportPreviewResponseSerializer,
    TableInfoSerializer,
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
            today = datetime.date.today().strftime("%Y%m%d")
            filename = f"unihub-export-{today}.zip"
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
