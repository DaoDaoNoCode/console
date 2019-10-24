import * as React from 'react';
import * as _ from 'lodash-es';
import { connect } from 'react-redux';

import { requirePrometheus } from '../graphs';
import { Health } from '../graphs/health';
import { deleteModal, NamespaceLineCharts, NamespaceSummary, TopPodsBarChart } from '../namespace';
import {
  ExternalLink,
  Firehose,
  ResourceLink,
  resourceListPathFromModel,
  StatusBox,
} from '../utils';
import { RoleBindingModel } from '../../models';
import { K8sResourceKind } from '../../module/k8s';
import {
  getQuotaResourceTypes,
  hasComputeResources,
  QuotaGaugeCharts,
  QuotaScopesInline,
} from '../resource-quota';

const editRoleBindings = (kind, obj) => ({
  label: 'Edit Role Bindings',
  href: resourceListPathFromModel(RoleBindingModel, obj.metadata.name),
});

export const overviewMenuActions = [editRoleBindings, deleteModal];

const OverviewHealth = requirePrometheus(({ ns }) => (
  <div className="group">
    <div className="group__title">
      <h2 className="h3">Health</h2>
    </div>
    <div className="container-fluid group__body">
      <Health namespace={ns.metadata.name} />
    </div>
  </div>
));

const OverviewResourceUsage = requirePrometheus(({ ns }) => (
  <div className="group">
    <div className="group__title">
      <h2 className="h3">Resource Usage</h2>
    </div>
    <div className="container-fluid group__body">
      <NamespaceLineCharts ns={ns} />
      <TopPodsBarChart ns={ns} />
    </div>
  </div>
));

const OverviewNamespaceSummary = ({ ns }) => (
  <div className="group">
    <div className="group__title">
      <h2 className="h3">Details</h2>
    </div>
    <div className="container-fluid group__body group__namespace-details">
      <NamespaceSummary ns={ns} />
    </div>
  </div>
);

export const getNamespaceDashboardConsoleLinks = (
  ns: K8sResourceKind,
  consoleLinks: K8sResourceKind[],
): K8sResourceKind[] => {
  return _.filter(consoleLinks, (link: K8sResourceKind) => {
    if (link.spec.location !== 'NamespaceDashboard') {
      return false;
    }
    const namespaces: string[] = _.get(link, ['spec', 'namespaceDashboard', 'namespaces']);
    return _.isEmpty(namespaces) || _.includes(namespaces, ns.metadata.name);
  });
};

export const ConsoleLinks: React.FC<ConsoleLinksProps> = ({ consoleLinks }) => {
  return (
    <ul className="list-unstyled">
      {_.map(_.sortBy(consoleLinks, 'spec.text'), (link: K8sResourceKind) => {
        return (
          <li key={link.metadata.uid}>
            <ExternalLink href={link.spec.href} text={link.spec.text} />
          </li>
        );
      })}
    </ul>
  );
};

const OverviewLinks_: React.FC<OverviewLinksProps> = ({ ns, consoleLinks }) => {
  const links = getNamespaceDashboardConsoleLinks(ns, consoleLinks);
  return (
    !_.isEmpty(links) && (
      <div className="group">
        <div className="group__title">
          <h2 className="h3">Launcher</h2>
        </div>
        <div className="container-fluid group__body group__namespace-details">
          <ConsoleLinks consoleLinks={links} />
        </div>
      </div>
    )
  );
};

const OverviewLinksStateToProps = ({ UI }) => ({
  consoleLinks: UI.get('consoleLinks'),
});

export const OverviewLinks = connect(OverviewLinksStateToProps)(OverviewLinks_);

const ResourceQuotaCharts = ({ quota, resourceTypes }) => {
  const scopes = _.get(quota, 'spec.scopes');
  return (
    <div className="group">
      <div className="group__title">
        <h2 className="h3">
          <ResourceLink
            kind="ResourceQuota"
            name={quota.metadata.name}
            className="co-resource-item--truncate"
            namespace={quota.metadata.namespace}
            inline="true"
            title={quota.metadata.name}
          />
          {scopes && (
            <QuotaScopesInline className="co-resource-quota-dashboard-scopes" scopes={scopes} />
          )}
        </h2>
      </div>
      <div className="group__body">
        <QuotaGaugeCharts quota={quota} resourceTypes={resourceTypes} />
      </div>
    </div>
  );
};

const ResourceQuotas: React.SFC<QuotaBoxesProps> = ({ resourceQuotas }) => {
  const { loaded, loadError, data: quotas } = resourceQuotas;

  if (!loaded) {
    return null;
  }
  if (loadError) {
    <StatusBox loadError={loadError} />;
  }
  const resourceQuotaRows = _.reduce(
    quotas,
    (accumulator, quota: K8sResourceKind) => {
      const resourceTypes = getQuotaResourceTypes(quota);
      if (hasComputeResources(resourceTypes)) {
        accumulator.push(
          <ResourceQuotaCharts
            key={quota.metadata.uid}
            quota={quota}
            resourceTypes={resourceTypes}
          />,
        );
      }
      return accumulator;
    },
    [],
  );

  return (
    <>
      {_.map(resourceQuotaRows, (quotaRow, index) => (
        <div key={index}>{quotaRow}</div>
      ))}
    </>
  );
};

const OverviewResourceQuotas = ({ ns }) => {
  const quotaResources = [
    {
      kind: 'ResourceQuota',
      namespace: ns.metadata.name,
      isList: true,
      prop: 'resourceQuotas',
    },
  ];
  return (
    <Firehose resources={quotaResources}>
      <ResourceQuotas />
    </Firehose>
  );
};

export const OverviewNamespaceDashboard = ({ obj: ns }) => (
  <div className="co-m-pane__body">
    <OverviewHealth ns={ns} />
    <OverviewResourceQuotas ns={ns} />
    <OverviewResourceUsage ns={ns} />
    <OverviewLinks ns={ns} />
    <OverviewNamespaceSummary ns={ns} />
  </div>
);

export type ConsoleLinksProps = {
  consoleLinks: K8sResourceKind[];
};

export type OverviewLinksProps = {
  ns: K8sResourceKind;
  consoleLinks: K8sResourceKind[];
};

export type QuotaBoxesProps = {
  resourceQuotas?: { loaded: boolean; loadError: string; data: K8sResourceKind };
};
