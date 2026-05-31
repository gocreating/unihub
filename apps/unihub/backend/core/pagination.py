"""Reusable pagination classes for entity list endpoints."""

from rest_framework.pagination import CursorPagination, LimitOffsetPagination


class EntityOffsetPagination(LimitOffsetPagination):
    """Offset-based pagination for entity list endpoints.

    Response envelope::

        {
          "count": 1250,
          "next": "https://host/api/v1/.../accounts/?limit=50&offset=100",
          "previous": "https://host/api/v1/.../accounts/?limit=50&offset=0",
          "results": [...]
        }

    Query params:
        limit: Number of records per page (1–500, default 50).
        offset: Zero-based record offset (default 0).
    """

    default_limit: int = 50
    max_limit: int = 500


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
