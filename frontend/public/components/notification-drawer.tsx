import * as _ from 'lodash';
import * as React from 'react';
import { connect } from 'react-redux';
import { Link } from 'react-router-dom';
import { history, Timestamp } from '@console/internal/components/utils';
import * as UIActions from '@console/internal/actions/ui';
import store, { RootState } from '@console/internal/redux';
import { Alert } from '@console/internal/components/monitoring/types';
import { alertURL } from '@console/internal/components/monitoring/utils';
import { NotificationAlerts } from '@console/internal/reducers/ui';
import { BlueArrowCircleUpIcon, RedExclamationCircleIcon } from '@console/shared';
import {
  getAlertDescription,
  getAlertMessage,
  getAlertName,
  getAlertSeverity,
  getAlertTime,
  getAlerts,
} from '@console/shared/src/components/dashboard/status-card/alert-utils';
import {
  EmptyState,
  EmptyStateBody,
  EmptyStateIcon,
  EmptyStateSecondaryActions,
  EmptyStateVariant,
  Title,
  NotificationDrawer,
  NotificationDrawerBody,
  NotificationDrawerHeader,
  NotificationDrawerGroup,
  NotificationDrawerGroupList,
  NotificationDrawerList,
  NotificationDrawerListItem,
  NotificationDrawerListItemBody,
  NotificationDrawerListItemHeader,
  Drawer,
  DrawerContent,
  DrawerPanelContent,
  DrawerPanelBody,
} from '@patternfly/react-core';

import { coFetchJSON } from '../co-fetch';
import {
  ClusterUpdate,
  ClusterVersionKind,
  getSortedUpdates,
  referenceForModel,
} from '../module/k8s';
import { ClusterVersionModel } from '../models';
import { usePrevious } from '@console/metal3-plugin/src/hooks';
import { useK8sWatchResource, WatchK8sResource } from './utils/k8s-watch-hook';

enum NotificationTypes {
  info = 'info',
  warning = 'warning',
  critical = 'danger',
  success = 'success',
  update = 'update',
}

const criticalCompare = (a: Alert): boolean => getAlertSeverity(a) === 'critical';
const otherAlertCompare = (a: Alert): boolean => getAlertSeverity(a) !== 'critical';

const AlertErrorState: React.FC<AlertErrorProps> = ({ errorText }) => (
  <EmptyState variant={EmptyStateVariant.full}>
    <EmptyStateIcon className="co-status-card__alerts-icon" icon={RedExclamationCircleIcon} />
    <Title headingLevel="h5" size="lg">
      Alerts could not be loaded
    </Title>
    {errorText && <EmptyStateBody>{errorText}</EmptyStateBody>}
  </EmptyState>
);

export const AlertEmptyState: React.FC<AlertEmptyProps> = ({ drawerToggle }) => (
  <EmptyState variant={EmptyStateVariant.full} className="co-status-card__alerts-msg">
    <Title headingLevel="h5" size="lg">
      No critical alerts
    </Title>
    <EmptyStateBody>
      There are currently no critical alerts firing. There may be firing alerts of other severities
      or silenced critical alerts however.
    </EmptyStateBody>
    <EmptyStateSecondaryActions>
      <Link to="/monitoring/alerts" onClick={drawerToggle}>
        View all alerts
      </Link>
    </EmptyStateSecondaryActions>
  </EmptyState>
);

export const alertActions = new Map().set('AlertmanagerReceiversNotConfigured', {
  text: 'Configure',
  path: '/monitoring/alertmanagerconfig',
});

export const getAlertNotificationEntries = (
  isLoaded: boolean,
  alertData: Alert[],
  toggleNotificationDrawer: () => void,
  isCritical: boolean,
  onKeyDown: (event: any) => any,
): React.ReactNode[] =>
  isLoaded && !_.isEmpty(alertData)
    ? alertData
        .filter((a) => (isCritical ? criticalCompare(a) : otherAlertCompare(a)))
        .map((alert, i) => {
          const action = alertActions.get(alert.rule.name);
          return (
            <NotificationDrawerListItem
              key={`${i}_${alert.activeAt}`}
              variant={NotificationTypes[getAlertSeverity(alert)]}
              onClick={
                alertURL(alert, alert.rule.id)
                  ? () => {
                      history.push(alertURL(alert, alert.rule.id));
                      toggleNotificationDrawer();
                    }
                  : null
              }
              onKeyDown={onKeyDown}
            >
              <NotificationDrawerListItemHeader
                variant={NotificationTypes[getAlertSeverity(alert)]}
                title={getAlertName(alert)}
                srTitle={`${_.capitalize(
                  NotificationTypes[getAlertSeverity(alert)],
                )} notification:`}
              >
                {action ? (
                  <Link
                    to={action.path}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleNotificationDrawer();
                    }}
                  >
                    {action.text}
                  </Link>
                ) : null}
              </NotificationDrawerListItemHeader>
              <NotificationDrawerListItemBody
                timestamp={
                  getAlertTime(alert) && <Timestamp simple timestamp={getAlertTime(alert)} />
                }
              >
                {getAlertDescription(alert) || getAlertMessage(alert)}
              </NotificationDrawerListItemBody>
            </NotificationDrawerListItem>
          );
        })
    : [];

const getUpdateNotificationEntries = (
  isLoaded: boolean,
  updateData: ClusterUpdate[],
  toggleNotificationDrawer: () => void,
  onKeyDown: (event: any) => any,
): React.ReactNode[] =>
  isLoaded && !_.isEmpty(updateData)
    ? [
        <NotificationDrawerListItem
          key="cluster-udpate"
          onClick={() => {
            history.push('/settings/cluster');
            toggleNotificationDrawer();
          }}
          onKeyDown={onKeyDown}
        >
          <NotificationDrawerListItemHeader
            title="Cluster update available"
            srTitle={`${_.capitalize('update')} notification:`}
            icon={<BlueArrowCircleUpIcon />}
          >
            <Link
              to="/settings/cluster"
              onClick={(e) => {
                e.stopPropagation();
                toggleNotificationDrawer();
              }}
            >
              Update cluster
            </Link>
          </NotificationDrawerListItemHeader>
          <NotificationDrawerListItemBody>
            {updateData[0].version || 'Unknown'}
          </NotificationDrawerListItemBody>
        </NotificationDrawerListItem>,
      ]
    : [];

const pollerTimeouts = {};
const pollers = {};
const cvResource: WatchK8sResource = {
  kind: referenceForModel(ClusterVersionModel),
  namespaced: false,
  name: 'version',
  isList: false,
  optional: true,
};

export const refreshNotificationPollers = () => {
  _.each(pollerTimeouts, clearTimeout);
  _.invoke(pollers, 'silences');
  _.invoke(pollers, 'notificationAlerts');
};

export const ConnectedNotificationDrawer_: React.FC<ConnectedNotificationDrawerProps> = ({
  isDesktop,
  toggleNotificationDrawer,
  toggleNotificationsRead,
  isDrawerExpanded,
  onDrawerChange,
  notificationsRead,
  alerts,
  children,
}) => {
  React.useEffect(() => {
    const poll: NotificationPoll = (url, key: 'notificationAlerts' | 'silences', dataHandler) => {
      store.dispatch(UIActions.monitoringLoading(key));
      const notificationPoller = (): void => {
        coFetchJSON(url)
          .then((response) => dataHandler(response))
          .then((data) => store.dispatch(UIActions.monitoringLoaded(key, data)))
          .catch((e) => store.dispatch(UIActions.monitoringErrored(key, e)))
          .then(() => (pollerTimeouts[key] = setTimeout(notificationPoller, 15 * 1000)));
      };
      pollers[key] = notificationPoller;
      notificationPoller();
    };
    const { alertManagerBaseURL, prometheusBaseURL } = window.SERVER_FLAGS;

    if (prometheusBaseURL) {
      poll(`${prometheusBaseURL}/api/v1/rules`, 'notificationAlerts', getAlerts);
    } else {
      store.dispatch(
        UIActions.monitoringErrored('notificationAlerts', new Error('prometheusBaseURL not set')),
      );
    }

    if (alertManagerBaseURL) {
      poll(`${alertManagerBaseURL}/api/v2/silences`, 'silences', (silences) => {
        // Set a name field on the Silence to make things easier
        _.each(silences, (s) => {
          s.name = _.get(_.find(s.matchers, { name: 'alertname' }), 'value');
          if (!s.name) {
            // No alertname, so fall back to displaying the other matchers
            s.name = s.matchers
              .map((m) => `${m.name}${m.isRegex ? '=~' : '='}${m.value}`)
              .join(', ');
          }
        });
        return silences;
      });
    } else {
      store.dispatch(
        UIActions.monitoringErrored('silences', new Error('alertManagerBaseURL not set')),
      );
    }

    return () => _.each(pollerTimeouts, clearTimeout);
  }, []);
  const [clusterVersionData, clusterVersionLoaded] = useK8sWatchResource<ClusterVersionKind>(
    cvResource,
  );
  const updateData: ClusterUpdate[] = getSortedUpdates(clusterVersionData);
  const { data, loaded, loadError } = alerts || {};

  const onKeyDown = (event: any) => {
    // Accessibility function. Click on the list item when pressing Enter or Space on it.
    if (event.key === 'Enter' || event.key === ' ') {
      event.target.click();
    }
    // Accessibility function. Focus on the Group title when pressing Escape on any group item.
    if (event.key === 'Escape') {
      event.target.parentNode.parentNode.firstChild.firstChild.focus();
    }
  };

  const updateList: React.ReactNode[] = getUpdateNotificationEntries(
    clusterVersionLoaded,
    updateData,
    toggleNotificationDrawer,
    onKeyDown,
  );
  const criticalAlertList: React.ReactNode[] = getAlertNotificationEntries(
    true,
    data,
    toggleNotificationDrawer,
    true,
    onKeyDown,
  );
  const otherAlertList: React.ReactNode[] = getAlertNotificationEntries(
    loaded,
    data,
    toggleNotificationDrawer,
    false,
    onKeyDown,
  );
  const [isAlertExpanded, toggleAlertExpanded] = React.useState<boolean>(
    !_.isEmpty(criticalAlertList),
  );
  const [isNonCriticalAlertExpanded, toggleNonCriticalAlertExpanded] = React.useState<boolean>(
    true,
  );
  const [isClusterUpdateExpanded, toggleClusterUpdateExpanded] = React.useState<boolean>(true);
  const prevDrawerToggleState = usePrevious(isDrawerExpanded);

  const hasCriticalAlerts = criticalAlertList.length > 0;
  const hasNonCriticalAlerts = otherAlertList.length > 0;
  React.useEffect(() => {
    if (hasCriticalAlerts && !prevDrawerToggleState && isDrawerExpanded) {
      toggleAlertExpanded(true);
    }
    if (hasNonCriticalAlerts && !prevDrawerToggleState && isDrawerExpanded) {
      toggleNonCriticalAlertExpanded(true);
    }
  }, [
    hasCriticalAlerts,
    hasNonCriticalAlerts,
    isAlertExpanded,
    isDrawerExpanded,
    prevDrawerToggleState,
  ]);
  React.useEffect(() => {
    onDrawerChange();
  }, [isDrawerExpanded, onDrawerChange]);

  const emptyState = !_.isEmpty(loadError) ? (
    <AlertErrorState errorText={loadError.message} />
  ) : (
    <AlertEmptyState drawerToggle={toggleNotificationDrawer} />
  );

  const criticalAlerts = _.isEmpty(criticalAlertList) ? emptyState : criticalAlertList;
  const criticalAlertCategory: React.ReactElement = (
    <NotificationDrawerGroup
      key="critical-alerts"
      isExpanded={isAlertExpanded}
      title="Critical Alerts"
      count={criticalAlertList.length}
      isRead
      onExpand={() => {
        toggleAlertExpanded(!isAlertExpanded);
      }}
    >
      <NotificationDrawerList isHidden={!isAlertExpanded}>{criticalAlerts}</NotificationDrawerList>
    </NotificationDrawerGroup>
  );
  const nonCriticalAlertCategory: React.ReactElement = !_.isEmpty(otherAlertList) ? (
    <NotificationDrawerGroup
      key="other-alerts"
      isExpanded={isNonCriticalAlertExpanded}
      title="Other Alerts"
      count={otherAlertList.length}
      isRead
      onExpand={() => {
        toggleNonCriticalAlertExpanded(!isNonCriticalAlertExpanded);
      }}
    >
      <NotificationDrawerList isHidden={!isNonCriticalAlertExpanded}>
        {otherAlertList}
      </NotificationDrawerList>
    </NotificationDrawerGroup>
  ) : null;

  const messageCategory: React.ReactElement = !_.isEmpty(updateList) ? (
    <NotificationDrawerGroup
      key="messages"
      isExpanded={isClusterUpdateExpanded}
      title="Messages"
      count={updateList.length}
      isRead
      onExpand={() => {
        toggleClusterUpdateExpanded(!isClusterUpdateExpanded);
      }}
    >
      <NotificationDrawerList isHidden={!isClusterUpdateExpanded}>
        {updateList}
      </NotificationDrawerList>
    </NotificationDrawerGroup>
  ) : null;

  if (_.isEmpty(data) && _.isEmpty(updateList) && !notificationsRead) {
    toggleNotificationsRead();
  } else if ((!_.isEmpty(data) || !_.isEmpty(updateList)) && notificationsRead) {
    toggleNotificationsRead();
  }

  const notificationEntries = [criticalAlertCategory, nonCriticalAlertCategory, messageCategory];

  const panelContent = (
    <DrawerPanelContent className="co-notification-drawer">
      <NotificationDrawer>
        <NotificationDrawerHeader />
        <NotificationDrawerBody>
          <NotificationDrawerGroupList>{notificationEntries}</NotificationDrawerGroupList>
        </NotificationDrawerBody>
      </NotificationDrawer>
      <DrawerPanelBody noPadding />
    </DrawerPanelContent>
  );

  return (
    <Drawer isExpanded={isDrawerExpanded} isInline={isDesktop}>
      <DrawerContent panelContent={panelContent}>{children}</DrawerContent>
    </Drawer>
  );
};

type NotificationPoll = (
  url: string,
  key: 'notificationAlerts' | 'silences',
  dataHandler: (data) => any,
) => void;

export type WithNotificationsProps = {
  isDrawerExpanded: boolean;
  notificationsRead: boolean;
  alerts?: NotificationAlerts;
  silences?: any;
};

export type ConnectedNotificationDrawerProps = {
  isDesktop: boolean;
  toggleNotificationsRead: () => any;
  toggleNotificationDrawer: () => any;
  isDrawerExpanded: boolean;
  notificationsRead: boolean;
  onDrawerChange: () => void;
  alerts: NotificationAlerts;
};

const notificationStateToProps = ({ UI }: RootState): WithNotificationsProps => ({
  isDrawerExpanded: !!UI.getIn(['notifications', 'isExpanded']),
  notificationsRead: !!UI.getIn(['notifications', 'isRead']),
  alerts: UI.getIn(['monitoring', 'notificationAlerts']),
  silences: UI.getIn(['monitoring', 'silences']),
});

type AlertErrorProps = {
  errorText: string;
};

type AlertEmptyProps = {
  drawerToggle: (event: React.MouseEvent<HTMLElement>) => void;
};

const connectToNotifications = connect((state: RootState) => notificationStateToProps(state), {
  toggleNotificationDrawer: UIActions.notificationDrawerToggleExpanded,
  toggleNotificationsRead: UIActions.notificationDrawerToggleRead,
});
export const ConnectedNotificationDrawer = connectToNotifications(ConnectedNotificationDrawer_);
