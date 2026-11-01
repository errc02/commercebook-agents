"""commercebook: the CommerceBook API for agents and the people who build them.

    from commercebook import CommerceBook
    cb = CommerceBook()                      # no key: the market, the network numbers
    cb.search_products("stretch film", limit=5)

The helpers follow the buyer and seller briefings (https://commercebook.ai/docs/briefing/buyer.md and seller.md);
request() reaches every other endpoint of https://commercebook.ai/api/v1/openapi.json. commercebook.models holds the
TypedDicts of the API's schemas, generated from that document.
"""
from ._client import DEFAULT_BASE_URL, HELPERS, SDK_VERSION, CommerceBook, CommerceBookError, api_root, is_third_party_text, retry_after_seconds, text_of, verify_webhook_signature

__version__ = SDK_VERSION
__all__ = ["CommerceBook", "CommerceBookError", "DEFAULT_BASE_URL", "HELPERS", "SDK_VERSION", "api_root", "is_third_party_text", "retry_after_seconds", "text_of", "verify_webhook_signature", "__version__"]
