from rest_framework import serializers


class FieldInfoSerializer(serializers.Serializer):
    csv_header = serializers.CharField()
    data_type = serializers.CharField()
    is_system = serializers.BooleanField()
    is_pk = serializers.BooleanField()


class TableInfoSerializer(serializers.Serializer):
    content_type_label = serializers.CharField()
    display_name = serializers.CharField()
    fields = FieldInfoSerializer(many=True)


class ExportRequestSerializer(serializers.Serializer):
    tables = serializers.ListField(child=serializers.CharField(), allow_empty=False)
    format = serializers.ChoiceField(choices=["csv", "zip"], required=False, allow_null=True, default=None)

    def validate(self, attrs: dict) -> dict:
        tables = attrs.get("tables", [])
        fmt = attrs.get("format")
        if len(tables) > 1 and fmt == "csv":
            raise serializers.ValidationError(
                {"format": "Use 'zip' format when exporting multiple tables."}
            )
        if fmt is None:
            attrs["format"] = "zip" if len(tables) > 1 else "csv"
        return attrs


class ImportPreviewRequestSerializer(serializers.Serializer):
    table = serializers.CharField()
    mode = serializers.ChoiceField(choices=["upsert", "replace"])
    csv_text = serializers.CharField(required=False, allow_blank=True, default="")
    csv_file = serializers.FileField(required=False, default=None)

    def validate(self, attrs: dict) -> dict:
        if not attrs.get("csv_text") and attrs.get("csv_file") is None:
            raise serializers.ValidationError(
                "Either csv_text or csv_file must be provided."
            )
        return attrs


class ChangeRecordSerializer(serializers.Serializer):
    pk = serializers.CharField()
    operation = serializers.ChoiceField(choices=["create", "update", "delete"])
    before = serializers.DictField(
        child=serializers.CharField(allow_blank=True), allow_null=True
    )
    after = serializers.DictField(
        child=serializers.CharField(allow_blank=True), allow_null=True
    )
    changed_fields = serializers.ListField(child=serializers.CharField())


class ValidationErrorSerializer(serializers.Serializer):
    row = serializers.IntegerField()
    column = serializers.CharField(allow_null=True)
    message = serializers.CharField()


class ImportPreviewResponseSerializer(serializers.Serializer):
    table = serializers.CharField()
    mode = serializers.CharField()
    total_rows_in_csv = serializers.IntegerField()
    total_rows_in_db = serializers.IntegerField()
    creates = ChangeRecordSerializer(many=True)
    updates = ChangeRecordSerializer(many=True)
    deletes = ChangeRecordSerializer(many=True)
    errors = ValidationErrorSerializer(many=True)


ImportConfirmRequestSerializer = ImportPreviewRequestSerializer


class ImportConfirmResponseSerializer(serializers.Serializer):
    table = serializers.CharField()
    mode = serializers.CharField()
    created = serializers.IntegerField()
    updated = serializers.IntegerField()
    deleted = serializers.IntegerField()
