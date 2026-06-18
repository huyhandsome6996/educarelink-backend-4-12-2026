"""Django admin registration cho tracking."""

from django.contrib import admin
from .models import LocationConsent, LiveLocation, LocationHistory, SOSAlert


@admin.register(LocationConsent)
class LocationConsentAdmin(admin.ModelAdmin):
    list_display = ('id', 'task', 'worker', 'consent', 'granted_at', 'revoked_at')
    list_filter = ('consent',)
    search_fields = ('task__title', 'worker__username')
    readonly_fields = ('created_at', 'updated_at', 'granted_at', 'revoked_at')


@admin.register(LiveLocation)
class LiveLocationAdmin(admin.ModelAdmin):
    list_display = ('id', 'task', 'worker', 'latitude', 'longitude',
                    'last_seen', 'is_outside_geofence')
    list_filter = ('is_outside_geofence',)
    search_fields = ('task__title', 'worker__username')
    readonly_fields = ('last_seen', 'created_at', 'geofence_warned_at')


@admin.register(LocationHistory)
class LocationHistoryAdmin(admin.ModelAdmin):
    list_display = ('id', 'task', 'worker', 'latitude', 'longitude', 'recorded_at')
    search_fields = ('task__title', 'worker__username')
    readonly_fields = ('recorded_at',)
    list_per_page = 100


@admin.register(SOSAlert)
class SOSAlertAdmin(admin.ModelAdmin):
    list_display = ('id', 'task', 'sender', 'sender_user', 'status', 'created_at', 'resolved_at')
    list_filter = ('sender', 'status')
    search_fields = ('task__title', 'sender_user__username', 'message')
    readonly_fields = ('created_at', 'resolved_at')
