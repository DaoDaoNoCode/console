import * as React from 'react';
import * as _ from 'lodash';
import { shallow, ShallowWrapper } from 'enzyme';
import {
  AlertEmptyState,
  getAlertNotificationEntries,
} from '../../public/components/notification-drawer';
import {
  CriticalAlertCategoryWrapper,
  OtherAlertCategoryWrapper,
} from '../../__mocks__/notificationDrawerCategoryWrapper';
import { alertItems } from '../../__mocks__/alertMock';
import { Alert } from '@console/internal/components/monitoring';

type CriticalAlertCategoryWrapperProps = React.ComponentProps<typeof CriticalAlertCategoryWrapper>;
let criticalAlertWrapperProps: CriticalAlertCategoryWrapperProps;

type OtherAlertCategoryWrapperProps = React.ComponentProps<typeof OtherAlertCategoryWrapper>;
let otherAlertWrapperProps: OtherAlertCategoryWrapperProps;

const toggleDrawer = jest.fn();
const onKeyDown = jest.fn();

describe('Notification Drawer', () => {
  let wrapper: ShallowWrapper;
  const mockAlertData: Alert[] = alertItems;

  describe('Critical Alert', () => {
    const criticalAlertList: React.ReactNode[] = getAlertNotificationEntries(
      true,
      mockAlertData,
      toggleDrawer,
      true,
      onKeyDown,
    );
    const emptyState: any = <AlertEmptyState drawerToggle={toggleDrawer} />;
    const criticalAlerts = _.isEmpty(criticalAlertList) ? emptyState : criticalAlertList;
    criticalAlertWrapperProps = {
      title: 'Critical Alerts',
      count: criticalAlertList.length,
      alertList: criticalAlertList,
      children: criticalAlerts,
    };
    wrapper = shallow(<CriticalAlertCategoryWrapper {...criticalAlertWrapperProps} />);

    it('find empty state if there is no critical alert in the list', () => {
      expect(wrapper.find(AlertEmptyState).exists()).toBe(true);
    });
    it('group list should not be expaneded if there is no alert', () => {
      expect(wrapper.prop('isExpanded')).toBe(false);
    });
  });

  describe('Other Alert', () => {
    const otherAlertList: React.ReactNode[] = getAlertNotificationEntries(
      true,
      mockAlertData,
      toggleDrawer,
      false,
      onKeyDown,
    );
    otherAlertWrapperProps = {
      title: 'Other Alerts',
      count: otherAlertList.length,
      alertList: otherAlertList,
    };
    wrapper = shallow(<OtherAlertCategoryWrapper {...otherAlertWrapperProps} />);

    it('group list should be expanded if there are non critical alerts', () => {
      expect(wrapper.prop('isExpanded')).toBe(true);
    });
    it('alert count in group list is right', () => {
      expect(wrapper.prop('count')).toEqual(mockAlertData.length);
    });
  });
});
