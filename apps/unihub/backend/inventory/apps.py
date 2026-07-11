from django.apps import AppConfig


class InventoryConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "inventory"

    def ready(self) -> None:
        # Register the inventory tables with the shared data_io import/export
        # registry (Constitution Principle I — data-portability consistency), so
        # inventory data participates in the standard CSV backup/restore flow.
        from data_io.registry import TableDescriptor, auto_system_fields, register
        from inventory.models import Acquisition, CostFactor, Item, Scenario, ScenarioItem

        # Parents before children (import_order): acquisition/scenario first.
        register(
            TableDescriptor(
                content_type_label="inventory.acquisition",
                display_name="Acquisitions",
                model_class=Acquisition,
                system_fields=auto_system_fields(Acquisition),
                has_user_attributes=False,
                import_order=1,
            )
        )
        register(
            TableDescriptor(
                content_type_label="inventory.item",
                display_name="Items",
                model_class=Item,
                system_fields=auto_system_fields(
                    Item,
                    fk_overrides={
                        "acquisition_id": {
                            "is_fk": True,
                            "fk_content_type_label": "inventory.acquisition",
                        },
                    },
                ),
                has_user_attributes=False,
                import_order=2,
            )
        )
        register(
            TableDescriptor(
                content_type_label="inventory.costfactor",
                display_name="Cost Factors",
                model_class=CostFactor,
                system_fields=auto_system_fields(
                    CostFactor,
                    fk_overrides={
                        "acquisition_id": {
                            "is_fk": True,
                            "fk_content_type_label": "inventory.acquisition",
                        },
                    },
                ),
                has_user_attributes=False,
                import_order=2,
            )
        )
        register(
            TableDescriptor(
                content_type_label="inventory.scenario",
                display_name="Scenarios",
                model_class=Scenario,
                system_fields=auto_system_fields(Scenario),
                has_user_attributes=False,
                import_order=3,
            )
        )
        register(
            TableDescriptor(
                content_type_label="inventory.scenarioitem",
                display_name="Scenario Items",
                model_class=ScenarioItem,
                system_fields=auto_system_fields(
                    ScenarioItem,
                    fk_overrides={
                        "scenario_id": {
                            "is_fk": True,
                            "fk_content_type_label": "inventory.scenario",
                        },
                        "item_id": {
                            "is_fk": True,
                            "fk_content_type_label": "inventory.item",
                        },
                        # Self-referential container FK.
                        "container_id": {
                            "is_fk": True,
                            "fk_content_type_label": "inventory.scenarioitem",
                        },
                    },
                ),
                has_user_attributes=False,
                import_order=4,
            )
        )
        # NOTE: `Constraint` is intentionally DEFERRED — its `items` ManyToMany
        # relation is not representable by the data_io registry (no M2M support).
        # Revisit when the registry gains M2M / join-table export (see FR-025).
