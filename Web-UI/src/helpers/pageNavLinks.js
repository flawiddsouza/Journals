export function generatePageLinks(activePage, {
    miniAppConfigMode,
    tableStatsView,
    tableStatsEditMode,
    tableConfigureMode,
    handlers,
}) {
    const links = []

    if (!activePage?.id) {
        return links
    }

    links.push({
        href: '#view-page-history',
        text: 'History',
        onClick: handlers.openHistory,
    })

    links.push({
        href: '#view-page-uploads',
        text: 'Uploads',
        onClick: handlers.openUploads,
    })

    links.push({
        href: '#backlinks',
        text: 'Backlinks',
        onClick: handlers.toggleBacklinks,
    })

    if (activePage.type !== 'Spreadsheet' && activePage.type !== 'DrawIO') {
        links.push({
            href: '#view-page-styles',
            text: 'Styles',
            onClick: handlers.openStyles,
        })

        if (activePage.type === 'Table' && activePage.view_only === false) {
            if (!tableStatsView) {
                if (!tableConfigureMode) {
                    links.push({
                        href: '#configure-table',
                        text: 'Configure Table',
                        mobileHide: true,
                        onClick: handlers.configureTable,
                    })
                } else {
                    links.push({
                        href: '#exit-configure-table',
                        text: 'Exit Configuration',
                        active: true,
                        onClick: handlers.exitConfigureTable,
                    })
                }
            }
            if (!tableConfigureMode) {
                links.push({
                    href: '#stats',
                    text: 'Stats',
                    active: tableStatsView,
                    onClick: handlers.toggleTableStats,
                })
                if (tableStatsView) {
                    links.push({
                        href: '#edit-stats',
                        text: 'Edit Stats',
                        active: tableStatsEditMode,
                        onClick: handlers.toggleTableStatsEdit,
                    })
                }
            }
        }

        if (activePage.type === 'MiniApp' && activePage.view_only === false) {
            if (!miniAppConfigMode) {
                links.push({
                    href: '#configure-mini-app',
                    text: 'Configure Mini App',
                    onClick: handlers.configureMiniApp,
                })
            } else {
                links.push({
                    href: '#exit-configure-mini-app',
                    text: 'Exit Configuration',
                    onClick: handlers.exitConfigureMiniApp,
                })
            }
        }

        links.push({
            href: '#export',
            text: 'Export',
            onClick: handlers.exportPage,
        })
    }

    if (activePage.parent_id !== undefined && activePage.parent_id !== null) {
        links.push({
            type: 'link',
            href: `/page/${activePage.parent_id}`,
            text: 'Open Page Group',
            target: '_blank',
        })
    }

    return links
}
