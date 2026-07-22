from django.contrib.contenttypes.fields import GenericRelation
from django.db import models

from core.nanoid import generate_id


class Acquisition(models.Model):
    """A record of how a batch of one or more items was obtained and paid for.

    This is the sole creation path for items (an item always belongs to one
    acquisition). A blank source represents unknown/pre-existing origin.
    """

    id = models.CharField(max_length=12, primary_key=True, default=generate_id, editable=False)
    # Stable legacy-import key (FR-029f c) — importer-internal, not in the API.
    legacy_ref = models.CharField(
        max_length=32, null=True, blank=True, db_index=True, editable=False
    )
    source = models.CharField(max_length=200, blank=True)  # store, seller, or person
    request_time = models.DateTimeField(null=True, blank=True)  # when the order was initiated
    obtained_at = models.DateTimeField(null=True, blank=True)  # when received
    remark = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-obtained_at", "-created_at"]

    def __str__(self) -> str:
        return self.source or "Acquisition"


class CostFactor(models.Model):
    """A signed line of an acquisition's payment (net_cost = per-currency sum).

    ``type`` is a free-form label (the constants below are UI suggestions only);
    ``accumulated`` is system-managed — one per currency, derived from item prices.
    """

    # UI suggestions only — not enforced as DB choices.
    TYPE_SUGGESTIONS = [
        "accumulated",
        "shipping",
        "discount",
        "tax_refund",
        "paid_by_other",
        "other",
    ]

    id = models.CharField(max_length=12, primary_key=True, default=generate_id, editable=False)
    acquisition = models.ForeignKey(
        Acquisition, on_delete=models.CASCADE, related_name="cost_factors"
    )
    value = models.DecimalField(max_digits=20, decimal_places=4)  # signed; negative reduces
    currency = models.CharField(max_length=3, blank=True)
    type = models.CharField(max_length=20, default="accumulated")  # free-form label
    display_order = models.IntegerField(default=0)  # user-defined ordering
    # Only consulted on accumulated rows: True = the user manually set this
    # amount (incl. clearing to 0) and no flow may auto-recalculate it (018).
    user_managed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["display_order", "created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["acquisition", "currency"],
                condition=models.Q(type="accumulated"),
                name="uniq_accumulated_per_currency",
            )
        ]

    def __str__(self) -> str:
        return f"{self.type} {self.value} {self.currency}".strip()


class Item(models.Model):
    """An individual physical thing the user owns or consumes. May be a container.

    Descriptive parameters (color, size, measurements, and any user-defined
    keys) live in the shared core AttributeDefinition/AttributeValue
    infrastructure as of iteration 14 — not as concrete columns.
    """

    id = models.CharField(max_length=12, primary_key=True, default=generate_id, editable=False)
    # Stable legacy-import key (FR-029f c): "<year>:<acq>:<item>" — lets
    # re-imports UPSERT in place so item PKs (and scenario memberships)
    # survive. Never exposed through the API.
    legacy_ref = models.CharField(
        max_length=32, null=True, blank=True, db_index=True, editable=False
    )
    name = models.CharField(max_length=200)
    # The user's own familiar name — preferred in displays (FR-030).
    alias_name = models.CharField(max_length=200, blank=True)
    quantity = models.IntegerField(default=1)
    spec = models.TextField(blank=True)
    remark = models.TextField(blank=True)
    sku_price = models.DecimalField(max_digits=20, decimal_places=4, null=True, blank=True)
    sku_price_currency = models.CharField(max_length=3, blank=True)
    url = models.CharField(max_length=500, blank=True)
    # Parameters (generic relation enables prefetching + cascade delete).
    attribute_values = GenericRelation("core.AttributeValue")
    # Lifecycle (iteration 36): `deprecated` is the STORED flag (status derives
    # from it); `deprecate_time` records WHEN — optional, null = unknown time.
    deprecated = models.BooleanField(default=False)
    deprecate_time = models.DateTimeField(null=True, blank=True)
    acquisition = models.ForeignKey(
        Acquisition,
        on_delete=models.CASCADE,
        related_name="items",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-acquisition__obtained_at"]

    def __str__(self) -> str:
        return self.name


class Scenario(models.Model):
    """A named situation the user prepares a set of items for."""

    id = models.CharField(max_length=12, primary_key=True, default=generate_id, editable=False)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class ScenarioItem(models.Model):
    """A scenario membership: an item in the packing tree (container + order).

    The preparation checklist (prepared/required_quantity) was removed in
    iteration 14; ordering within a container persists via display_order.
    """

    id = models.CharField(max_length=12, primary_key=True, default=generate_id, editable=False)
    scenario = models.ForeignKey(Scenario, on_delete=models.CASCADE, related_name="items")
    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name="scenario_items")
    container = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="contained_items",
    )
    display_order = models.IntegerField(default=0)  # sibling order within a container
    # False = unorganized flat pane (container unused); True = in the packing tree.
    organized = models.BooleanField(default=False)
    notes = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["display_order", "created_at"]
        unique_together = [("scenario", "item")]

    def __str__(self) -> str:
        return f"{self.scenario.name} / {self.item.name}"
