from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView


class VersionView(APIView):
    """Return the currently deployed application version."""

    permission_classes = []

    def get(self, request: Request) -> Response:
        """Return the application version string.

        Returns:
            Response: JSON body with a single ``version`` key.
        """
        from django.conf import settings

        return Response({"version": settings.VERSION})
