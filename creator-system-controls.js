function updateFeatureFlagFromRequest({ helpers, actorUserId, body = {} }) {
    if (typeof helpers?.updateFeatureFlag !== 'function') {
        throw new Error('Le service des interrupteurs Sentinel est indisponible.');
    }

    const featureKey = String(body.featureKey || '').trim();
    const enabled = body.enabled === true || String(body.enabled).toLowerCase() === 'true';
    const reason = String(body.reason || '').trim().slice(0, 500);
    let feature;
    try {
        feature = helpers.updateFeatureFlag(featureKey, enabled, actorUserId, reason);
    } catch (error) {
        error.status = 400;
        throw error;
    }
    const message = `${feature.label} ${enabled ? 'réactivée' : 'suspendue'}.`;

    return { featureKey, enabled, reason, message };
}

module.exports = {
    updateFeatureFlagFromRequest
};
