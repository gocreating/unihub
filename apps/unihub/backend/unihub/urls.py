from django.contrib import admin
from django.urls import path, include
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from unihub.auth.views import login_view, logout_view, me_view

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/v1/auth/login/", login_view),
    path("api/v1/auth/logout/", logout_view),
    path("api/v1/auth/me/", me_view),
    path("api/v1/health/", include("health.urls")),
    path("api/v1/core/", include("core.urls")),
    path("api/v1/io/", include("data_io.urls")),
    path("api/v1/finance/", include("finance.urls")),
    path("api/visiting/", include("visiting.urls")),
    path("api/language/", include("language.urls")),
    path("api/people/", include("people.urls")),
    path("api/music/", include("music.urls")),
]
