'use strict';

const SITE_ACCESS_ROLES = Object.freeze({
    FOUNDER: 'founder',
    STAFF: 'staff',
    USER: 'user'
});

function siteCapabilities(role) {
    const normalized = Object.values(SITE_ACCESS_ROLES).includes(role) ? role : SITE_ACCESS_ROLES.USER;
    return {
        role: normalized,
        isFounder: normalized === SITE_ACCESS_ROLES.FOUNDER,
        isStaff: normalized === SITE_ACCESS_ROLES.STAFF,
        canViewSitePanel: normalized === SITE_ACCESS_ROLES.FOUNDER || normalized === SITE_ACCESS_ROLES.STAFF,
        canManagePremium: normalized === SITE_ACCESS_ROLES.FOUNDER,
        canManageSiteStaff: normalized === SITE_ACCESS_ROLES.FOUNDER,
        staffAssignment: normalized === SITE_ACCESS_ROLES.STAFF,
        discordStaffRole: normalized === SITE_ACCESS_ROLES.FOUNDER
    };
}

module.exports = { SITE_ACCESS_ROLES, siteCapabilities };
