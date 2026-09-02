"""AppConfig cho performance module."""
from django.apps import AppConfig


class PerformanceConfig(AppConfig):
    name = 'performance'
    verbose_name = '⚡ Tối ưu hiệu năng (LRU Cache + Connection Pool + Spatial Index)'
