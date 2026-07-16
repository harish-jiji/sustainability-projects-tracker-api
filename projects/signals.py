from django.db.models.signals import post_save, post_delete, m2m_changed
from django.dispatch import receiver
from django.core.cache import cache
from .models import Project, Contributor, Task

@receiver([post_save, post_delete], sender=Project)
@receiver([post_save, post_delete], sender=Contributor)
@receiver([post_save, post_delete], sender=Task)
@receiver(m2m_changed, sender=Task.projects.through)
def clear_cache_on_modification(sender, **kwargs):
    """
    Clear the entire cache when any of the models are saved, deleted, or m2m changed.
    This guarantees cache consistency across all filtered list and detail endpoints.
    """
    cache.clear()
    print(f"Cache cleared successfully due to modification on model: {sender.__name__}")

