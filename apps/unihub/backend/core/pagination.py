"""Reusable pagination classes for entity list endpoints."""

from rest_framework.pagination import CursorPagination, LimitOffsetPagination
from rest_framework.response import Response


class EntityOffsetPagination(LimitOffsetPagination):
    """Offset-based pagination for entity list endpoints.

    Response envelope::

        {
          "count": 1250,
          "next": "https://host/api/v1/.../accounts/?limit=50&offset=100",
          "previous": "https://host/api/v1/.../accounts/?limit=50&offset=0",
          "totals": {...},          # only when the view defines get_footer_totals
          "results": [...]
        }

    Query params:
        limit: Number of records per page (1–500, default 50).
        offset: Zero-based record offset (default 0).

    Footer totals (iteration 15): a view may define
    ``get_footer_totals(filtered_queryset) -> dict`` — the dict is included as
    ``totals`` in the response, computed over the FILTERED queryset (so footer
    figures like "{x} acquisitions, {y} items" respect active filters).
    """

    default_limit: int = 50
    max_limit: int = 500

    def paginate_queryset(self, queryset, request, view=None):
        self._footer_totals = None
        if view is not None and hasattr(view, "get_footer_totals"):
            self._footer_totals = view.get_footer_totals(queryset)
        return super().paginate_queryset(queryset, request, view)

    def get_paginated_response(self, data):
        response: Response = super().get_paginated_response(data)
        if self._footer_totals is not None:
            response.data["totals"] = self._footer_totals
        return response

    def get_paginated_response_schema(self, schema):
        base = super().get_paginated_response_schema(schema)
        base["properties"]["totals"] = {
            "type": "object",
            "additionalProperties": {"type": "integer"},
            "description": "Footer totals over the filtered queryset (view-defined).",
        }
        return base


class EntityCursorPagination(CursorPagination):
    """Cursor-based pagination for entity list endpoints.

    Suitable for high-volume append-only entities where total record count
    and jump-to-page navigation are not required.

    Response envelope::

        {
          "next": "https://host/.../balance-sheets/?cursor=cD0yMDI1...",
          "previous": null,
          "results": [...]
        }

    Query params:
        cursor: Opaque cursor string returned by the previous response.
        limit: Number of records per page (1–500, default 50).

    Note:
        The viewset using this class must set a stable ``ordering`` attribute.
    """

    page_size: int = 50
    page_size_query_param: str = "limit"
    max_page_size: int = 500
    ordering: str = "-created_at"
