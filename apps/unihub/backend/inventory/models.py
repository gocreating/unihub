from django.db import models

from core.nanoid import generate_id

LENGTH_UNIT_CHOICES = [("mm", "mm"), ("cm", "cm"), ("m", "m"), ("in", "in")]
WEIGHT_UNIT_CHOICES = [("g", "g"), ("kg", "kg"), ("lb", "lb")]
VOLUME_UNIT_CHOICES = [("mL", "mL"), ("L", "L")]


class Acquisition(models.Model):
    """A record of how a batch of one or more items was obtained and paid for.

    This is the sole creation path for items (an item always belongs to one
    acquisition). A blank source represents unknown/pre-existing origin.
    """

    id = models.CharField(max_length=12, primary_key=True, default=generate_id, editable=False)
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
    """A signed line of an acquisition's payment (net_cost = per-currency sum)."""

    TYPE_CHOICES = [
        ("accumulated", "Accumulated"),
        ("shipping", "Shipping"),
        ("discount", "Discount"),
        ("tax_refund", "Tax refund"),
        ("paid_by_other", "Paid by other"),
        ("other", "Other"),
    ]

    id = models.CharField(max_length=12, primary_key=True, default=generate_id, editable=False)
    acquisition = models.ForeignKey(
        Acquisition, on_delete=models.CASCADE, related_name="cost_factors"
    )
    value = models.DecimalField(max_digits=20, decimal_places=4)  # signed; negative reduces
    currency = models.CharField(max_length=3, blank=True)
    type = models.CharField(max_length=20, choices=TYPE_CHOICES, default="accumulated")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"{self.type} {self.value} {self.currency}".strip()


class Item(models.Model):
    """An individual physical thing the user owns or consumes. May be a container."""

    id = models.CharField(max_length=12, primary_key=True, default=generate_id, editable=False)
    name = models.CharField(max_length=200)
    quantity = models.IntegerField(default=1)
    spec = models.TextField(blank=True)
    remark = models.TextField(blank=True)
    # Dimensions: canonical value stored in millimetres + the display unit.
    length_canonical = models.DecimalField(max_digits=14, decimal_places=4, null=True, blank=True)
    length_unit = models.CharField(max_length=4, choices=LENGTH_UNIT_CHOICES, default="mm")
    width_canonical = models.DecimalField(max_digits=14, decimal_places=4, null=True, blank=True)
    width_unit = models.CharField(max_length=4, choices=LENGTH_UNIT_CHOICES, default="mm")
    height_canonical = models.DecimalField(max_digits=14, decimal_places=4, null=True, blank=True)
    height_unit = models.CharField(max_length=4, choices=LENGTH_UNIT_CHOICES, default="mm")
    size = models.CharField(max_length=100, blank=True)
    # Weight: canonical value stored in grams + the display unit.
    weight_canonical = models.DecimalField(max_digits=14, decimal_places=4, null=True, blank=True)
    weight_unit = models.CharField(max_length=4, choices=WEIGHT_UNIT_CHOICES, default="g")
    # Volume: canonical value stored in millilitres + the display unit.
    volume_canonical = models.DecimalField(max_digits=14, decimal_places=4, null=True, blank=True)
    volume_unit = models.CharField(max_length=4, choices=VOLUME_UNIT_CHOICES, default="mL")
    sku_price = models.DecimalField(max_digits=20, decimal_places=4, null=True, blank=True)
    sku_price_currency = models.CharField(max_length=3, blank=True)
    color = models.CharField(max_length=50, blank=True)
    url = models.CharField(max_length=500, blank=True)
    # Lifecycle: deprecated when deprecate_time is set (status is derived, not stored).
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
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class ScenarioItem(models.Model):
    """A checklist line: an item required for a scenario, with packing state."""

    id = models.CharField(max_length=12, primary_key=True, default=generate_id, editable=False)
    scenario = models.ForeignKey(Scenario, on_delete=models.CASCADE, related_name="items")
    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name="scenario_items")
    required_quantity = models.DecimalField(max_digits=20, decimal_places=4, default=1)
    prepared = models.BooleanField(default=False)
    container = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="contained_items",
    )
    notes = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        unique_together = [("scenario", "item")]

    def __str__(self) -> str:
        return f"{self.scenario.name} / {self.item.name}"


class Constraint(models.Model):
    """A packing rule attached to a scenario, evaluated against its selection."""

    TYPE_CHOICES = [
        ("mutual_exclusive", "Mutually exclusive"),
        ("required", "Required"),
        ("weight_limit", "Weight limit"),
    ]

    id = models.CharField(max_length=12, primary_key=True, default=generate_id, editable=False)
    scenario = models.ForeignKey(Scenario, on_delete=models.CASCADE, related_name="constraints")
    name = models.CharField(max_length=200, blank=True)
    constraint_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    items = models.ManyToManyField(Item, related_name="constraints", blank=True)
    limit_value = models.DecimalField(max_digits=14, decimal_places=4, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"{self.scenario.name} / {self.constraint_type}"
