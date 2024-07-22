/*
 * Copyright (c) 2022, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { Messages } from '@salesforce/core/messages';
import {
  loglevel,
  orgApiVersionFlagWithDeprecations,
  requiredOrgFlagWithDeprecations,
  SfCommand,
} from '@salesforce/sf-plugins-core';
import { InstalledPackages, SubscriberPackageVersion } from '@salesforce/packaging';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@salesforce/plugin-packaging', 'package_installed_list');

export type PackageInstalledListResult = {
  Id: string;
  SubscriberPackageId?: string;
  SubscriberPackageName?: string;
  SubscriberPackageNamespace?: string;
  SubscriberPackageVersionId?: string;
  SubscriberPackageVersionName?: string;
  SubscriberPackageVersionNumber?: string;
};

export type PackageInstalledCommandResult = PackageInstalledListResult[];

export class PackageInstalledListCommand extends SfCommand<PackageInstalledCommandResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly examples = messages.getMessages('examples');
  public static readonly deprecateAliases = true;
  public static readonly aliases = ['force:package:installed:list'];

  public static readonly flags = {
    loglevel,
    'target-org': requiredOrgFlagWithDeprecations,
    'api-version': orgApiVersionFlagWithDeprecations,
  };

  public async run(): Promise<PackageInstalledCommandResult> {
    const { flags } = await this.parse(PackageInstalledListCommand);
    const records = (
      await SubscriberPackageVersion.installedList(flags['target-org'].getConnection(flags['api-version']))
    ).map(transformRow);

    this.table(
      records,
      columns,

      { 'no-truncate': true }
    );

    return records;
  }
}

const transformRow = (r: InstalledPackages): PackageInstalledListResult => ({
  Id: r.Id,
  SubscriberPackageId: r.SubscriberPackageId,
  SubscriberPackageName: r.SubscriberPackage?.Name,
  SubscriberPackageNamespace: r.SubscriberPackage?.NamespacePrefix,
  SubscriberPackageVersionId: r.SubscriberPackageVersion?.Id,
  SubscriberPackageVersionName: r.SubscriberPackageVersion?.Name,
  SubscriberPackageVersionNumber: `${r.SubscriberPackageVersion?.MajorVersion}.${r.SubscriberPackageVersion?.MinorVersion}.${r.SubscriberPackageVersion?.PatchVersion}.${r.SubscriberPackageVersion?.BuildNumber}`,
});

const columns = {
  Id: { header: 'ID' },
  SubscriberPackageId: { header: 'Package ID' },
  SubscriberPackageName: { header: 'Package Name' },
  SubscriberPackageNamespace: { header: 'Namespace' },
  SubscriberPackageVersionId: { header: 'Package Version ID' },
  SubscriberPackageVersionName: { header: 'Version Name' },
  SubscriberPackageVersionNumber: { header: 'Version' },
};
