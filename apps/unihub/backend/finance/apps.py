from django.apps import AppConfig


class FinanceConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "finance"

    def ready(self) -> None:
        from data_io.registry import FieldDescriptor, TableDescriptor, register
        from finance.models import Account, Balance, BalanceSheet, Currency, ExchangeRate

        register(
            TableDescriptor(
                content_type_label="finance.currency",
                display_name="Currencies",
                model_class=Currency,
                system_fields=[
                    FieldDescriptor(
                        column_name="code", csv_header="code:string", data_type="string", is_pk=True
                    ),
                    FieldDescriptor(column_name="name", csv_header="name:text", data_type="text"),
                    FieldDescriptor(
                        column_name="symbol",
                        csv_header="symbol:text",
                        data_type="text",
                        nullable=True,
                    ),
                ],
                has_user_attributes=False,
                import_order=1,
            )
        )
        register(
            TableDescriptor(
                content_type_label="finance.account",
                display_name="Accounts",
                model_class=Account,
                system_fields=[
                    FieldDescriptor(
                        column_name="id", csv_header="id:string", data_type="string", is_pk=True
                    ),
                    FieldDescriptor(column_name="name", csv_header="name:text", data_type="text"),
                    FieldDescriptor(
                        column_name="currency", csv_header="currency:string", data_type="string"
                    ),
                    FieldDescriptor(
                        column_name="open_datetime",
                        csv_header="open_datetime:datetime",
                        data_type="datetime",
                        nullable=True,
                    ),
                    FieldDescriptor(
                        column_name="close_datetime",
                        csv_header="close_datetime:datetime",
                        data_type="datetime",
                        nullable=True,
                    ),
                ],
                has_user_attributes=True,
                import_order=3,
            )
        )
        register(
            TableDescriptor(
                content_type_label="finance.balancesheet",
                display_name="Balance Sheets",
                model_class=BalanceSheet,
                system_fields=[
                    FieldDescriptor(
                        column_name="id", csv_header="id:string", data_type="string", is_pk=True
                    ),
                    FieldDescriptor(
                        column_name="date", csv_header="date:datetime", data_type="datetime"
                    ),
                ],
                has_user_attributes=False,
                import_order=4,
            )
        )
        register(
            TableDescriptor(
                content_type_label="finance.exchangerate",
                display_name="Exchange Rates",
                model_class=ExchangeRate,
                system_fields=[
                    FieldDescriptor(
                        column_name="id", csv_header="id:string", data_type="string", is_pk=True
                    ),
                    FieldDescriptor(
                        column_name="base_currency",
                        csv_header="base_currency:string",
                        data_type="string",
                    ),
                    FieldDescriptor(
                        column_name="quote_currency",
                        csv_header="quote_currency:string",
                        data_type="string",
                    ),
                    FieldDescriptor(
                        column_name="rate", csv_header="rate:decimal", data_type="decimal"
                    ),
                    FieldDescriptor(
                        column_name="date", csv_header="date:datetime", data_type="datetime"
                    ),
                ],
                has_user_attributes=False,
                import_order=5,
            )
        )
        register(
            TableDescriptor(
                content_type_label="finance.balance",
                display_name="Balances",
                model_class=Balance,
                system_fields=[
                    FieldDescriptor(
                        column_name="id", csv_header="id:string", data_type="string", is_pk=True
                    ),
                    FieldDescriptor(
                        column_name="account_id",
                        csv_header="account_id:string",
                        data_type="string",
                        is_fk=True,
                        fk_content_type_label="finance.account",
                    ),
                    FieldDescriptor(
                        column_name="balance_sheet_id",
                        csv_header="balance_sheet_id:string",
                        data_type="string",
                        is_fk=True,
                        fk_content_type_label="finance.balancesheet",
                    ),
                    FieldDescriptor(
                        column_name="amount", csv_header="amount:decimal", data_type="decimal"
                    ),
                ],
                has_user_attributes=False,
                import_order=6,
            )
        )
