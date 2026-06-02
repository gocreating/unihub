"""DRF filter backends for entity filtering and null-aware ordering."""

import json
from typing import Any

from django.db.models import F, Q, QuerySet
from rest_framework.exceptions import ValidationError
from rest_framework.filters import BaseFilterBackend, OrderingFilter
from rest_framework.request import Request


_NEGATE_OPS: frozenset[str] = frozenset(
    {"not_contains", "not_equals", "neq", "is_not", "is_not_empty"}
)

_OP_SUFFIX: dict[str, str | None] = {
    "contains": "__icontains",
    "not_contains": "__icontains",
    "equals": "__iexact",
    "not_equals": "__iexact",
    "starts_with": "__istartswith",
    "ends_with": "__iendswith",
    "eq": "",
    "neq": "",
    "gt": "__gt",
    "gte": "__gte",
    "lt": "__lt",
    "lte": "__lte",
    "is": "__iexact",
    "is_not": "__iexact",
    "date_before": "__lt",
    "date_after": "__gt",
}


_NULLS_FIRST_SUFFIX = "__nullsfirst"
_NULLS_LAST_SUFFIX = "__nullslast"


class NullsOrderingFilter(OrderingFilter):
    """Extends DRF's OrderingFilter to support NULLS FIRST / NULLS LAST.

    Accepts ``__nullsfirst`` and ``__nullslast`` suffixes on ordering fields::

        ?ordering=close_datetime__nullsfirst   → ORDER BY close_datetime ASC NULLS FIRST
        ?ordering=-close_datetime__nullslast   → ORDER BY close_datetime DESC NULLS LAST

    Validation still uses ``ordering_fields`` — only the clean field name (suffix
    stripped) is checked, so ``close_datetime__nullsfirst`` is accepted if
    ``close_datetime`` is in ``ordering_fields``.
    """

    def _parse_term(self, term: str) -> tuple[str, bool, str | None]:
        """Return (field_name, is_desc, nulls_spec) for one ordering token."""
        desc = term.startswith("-")
        base = term[1:] if desc else term
        if base.endswith(_NULLS_FIRST_SUFFIX):
            return base[: -len(_NULLS_FIRST_SUFFIX)], desc, "first"
        if base.endswith(_NULLS_LAST_SUFFIX):
            return base[: -len(_NULLS_LAST_SUFFIX)], desc, "last"
        return base, desc, None

    def remove_invalid_fields(self, queryset, fields, view, request):
        valid_names = {item[0] for item in self.get_valid_fields(queryset, view, {"request": request})}
        return [term for term in fields if self._parse_term(term)[0] in valid_names]

    def filter_queryset(self, request, queryset, view):
        orderings = self.get_ordering(request, queryset, view)
        if not orderings:
            return queryset
        expressions = []
        for term in orderings:
            field, desc, nulls_spec = self._parse_term(term)
            if nulls_spec:
                f = F(field)
                if nulls_spec == "first":
                    expr = f.desc(nulls_first=True) if desc else f.asc(nulls_first=True)
                else:
                    expr = f.desc(nulls_last=True) if desc else f.asc(nulls_last=True)
                expressions.append(expr)
            else:
                expressions.append(term)
        return queryset.order_by(*expressions)


class EntityFilterBackend(BaseFilterBackend):
    """DRF filter backend that accepts a JSON-encoded ``filters`` query param.

    The ``filters`` param must be a JSON object with the following shape::

        {
          "groups": [
            {
              "logic": "and",            # or "or"
              "conditions": [
                {"attr": "name", "op": "contains", "val": "savings"}
              ]
            }
          ]
        }

    Multiple condition groups are combined with OR.
    Conditions within a group are combined with AND or OR (per ``group.logic``).

    Viewsets opt in by declaring ``filterable_fields``::

        filterable_fields = {
            "name":     {"lookup": "name",     "type": "text"},
            "currency": {"lookup": "currency", "type": "single_select"},
        }

    Unknown ``attr`` keys are silently skipped so that the API remains stable
    when schema evolves.
    """

    def filter_queryset(self, request: Request, queryset: QuerySet, view: Any) -> QuerySet:
        """Return the filtered queryset based on the ``filters`` query param.

        Args:
            request: The incoming DRF request.
            queryset: The base queryset to filter.
            view: The DRF view; must expose ``filterable_fields`` to opt in.

        Returns:
            The filtered queryset, or the original queryset when no valid filter
            is present.

        Raises:
            ValidationError: When the ``filters`` param contains invalid JSON.
        """
        params = getattr(request, "query_params", None) or request.GET
        raw = params.get("filters")
        if not raw:
            return queryset

        try:
            payload: dict = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            raise ValidationError({"filters": "Invalid filter format."})

        filterable_fields: dict = getattr(view, "filterable_fields", {})
        groups = payload.get("groups", [])
        if not groups:
            return queryset

        group_qs: list[Q] = []
        for group in groups:
            conditions = group.get("conditions", [])
            logic: str = group.get("logic", "and").lower()

            condition_qs: list[Q] = []
            for cond in conditions:
                q = self._build_condition_q(cond, filterable_fields)
                if q is not None:
                    condition_qs.append(q)

            if not condition_qs:
                continue

            if logic == "or":
                group_q = condition_qs[0]
                for q in condition_qs[1:]:
                    group_q |= q
            else:
                group_q = condition_qs[0]
                for q in condition_qs[1:]:
                    group_q &= q

            group_qs.append(group_q)

        if not group_qs:
            return queryset

        combined = group_qs[0]
        for q in group_qs[1:]:
            combined |= q

        return queryset.filter(combined)

    def _build_condition_q(self, condition: dict, filterable_fields: dict) -> Q | None:
        """Build a single Django Q object from a filter condition dict.

        Args:
            condition: A dict with keys ``attr``, ``op``, and ``val``.
            filterable_fields: The view's ``filterable_fields`` mapping.

        Returns:
            A Q object, or None when the attr is unknown or operator unsupported.
        """
        attr: str = condition.get("attr", "")
        op: str = condition.get("op", "")
        val: str = condition.get("val", "")

        if attr not in filterable_fields:
            return None

        lookup: str = filterable_fields[attr].get("lookup", attr)

        if op == "is_empty":
            return Q(**{f"{lookup}__isnull": True}) | Q(**{lookup: ""})
        if op == "is_not_empty":
            return ~(Q(**{f"{lookup}__isnull": True}) | Q(**{lookup: ""}))

        suffix = _OP_SUFFIX.get(op)
        if suffix is None:
            return None

        orm_lookup = f"{lookup}{suffix}"
        q = Q(**{orm_lookup: val})
        if op in _NEGATE_OPS:
            q = ~q
        return q
