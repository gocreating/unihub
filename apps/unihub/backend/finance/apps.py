from django.apps import AppConfig


class FinanceConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "finance"

    def ready(self) -> None:
        from data_io.registry import TableDescriptor, auto_system_fields, register
        from finance.models import Account, Balance, BalanceSheet, Currency, ExchangeRate

        # Currency — no FK fields; auto_system_fields covers all columns.
        register(
            TableDescriptor(
                content_type_label="finance.currency",
                display_name="Currencies",
                model_class=Currency,
                system_fields=auto_system_fields(Currency),
                has_user_attributes=False,
                import_order=1,
            )
        )

        # Account — no FK fields (currency is a plain CharField, not a FK).
        register(
            TableDescriptor(
                content_type_label="finance.account",
                display_name="Accounts",
                model_class=Account,
                system_fields=auto_system_fields(Account),
                has_user_attributes=True,
                import_order=3,
            )
        )

        # BalanceSheet — no FK fields.
        register(
            TableDescriptor(
                content_type_label="finance.balancesheet",
                display_name="Balance Sheets",
                model_class=BalanceSheet,
                system_fields=auto_system_fields(BalanceSheet),
                has_user_attributes=False,
                import_order=4,
            )
        )

        # ExchangeRate — no FK fields.
        register(
            TableDescriptor(
                content_type_label="finance.exchangerate",
                display_name="Exchange Rates",
                model_class=ExchangeRate,
                system_fields=auto_system_fields(ExchangeRate),
                has_user_attributes=False,
                import_order=5,
            )
        )

        # Balance — two FK fields require explicit fk_content_type_label overrides.
        register(
            TableDescriptor(
                content_type_label="finance.balance",
                display_name="Balances",
                model_class=Balance,
                system_fields=auto_system_fields(
                    Balance,
                    fk_overrides={
                        "account_id": {
                            "is_fk": True,
                            "fk_content_type_label": "finance.account",
                        },
                        "balance_sheet_id": {
                            "is_fk": True,
                            "fk_content_type_label": "finance.balancesheet",
                        },
                    },
                ),
                has_user_attributes=False,
                import_order=6,
            )
        )
