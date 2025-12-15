def get_js_cleanup():
    return """
    document.querySelectorAll(`
        .ad-slot-module__container__VEdre,
        .container--ads,
        .cmpwrapper
    `).forEach(e => e.remove());
    """
