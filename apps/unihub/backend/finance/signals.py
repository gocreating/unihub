from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from finance.models import Transaction


@receiver(post_save, sender=Transaction)
@receiver(post_delete, sender=Transaction)
def update_portfolio_times(sender, instance, **kwargs):
    instance.portfolio.refresh_transaction_times()
