from django.db.models.signals import post_save, post_delete, m2m_changed
from django.dispatch import receiver
from django.core.cache import cache
from django.contrib.auth.models import User
from .models import Project, Contributor, Task, AdminProfile

@receiver([post_save, post_delete], sender=Project)
@receiver([post_save, post_delete], sender=Contributor)
@receiver([post_save, post_delete], sender=Task)
@receiver([post_save, post_delete], sender=AdminProfile)
@receiver(m2m_changed, sender=Task.projects.through)
def clear_cache_on_modification(sender, **kwargs):
    """
    Clear the entire cache when any of the models are saved, deleted, or m2m changed.
    This guarantees cache consistency across all filtered list and detail endpoints.
    """
    cache.clear()
    print(f"Cache cleared successfully due to modification on model: {sender.__name__}")


@receiver(post_save, sender=User)
def create_admin_profile(sender, instance, created, **kwargs):
    """
    Automatically create an AdminProfile for every User.
    """
    if created:
        AdminProfile.objects.get_or_create(user=instance)

