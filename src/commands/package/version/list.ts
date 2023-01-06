/*
 * Copyright (c) 2022, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import {
  Flags,
  loglevel,
  orgApiVersionFlagWithDeprecations,
  requiredHubFlagWithDeprecations,
  SfCommand,
} from '@salesforce/sf-plugins-core';
import { Messages, SfProject } from '@salesforce/core';
import { CliUx } from '@oclif/core';
import {
  getContainerOptions,
  getPackageVersionStrings,
  INSTALL_URL_BASE,
  Package,
  PackageVersionListResult,
} from '@salesforce/packaging';
import { Optional } from '@salesforce/ts-types';

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('@salesforce/plugin-packaging', 'package_version_list');
const packaging = Messages.loadMessages('@salesforce/plugin-packaging', 'packaging');

export type PackageVersionListDetails = Omit<
  PackageVersionListResult,
  | 'HasMetadataRemoved'
  | 'IsReleased'
  | 'IsPasswordProtected'
  | 'HasPassedCodeCoverageCheck'
  | 'CreatedById'
  | 'BuildDurationInSeconds'
  | 'CodeCoverage'
  | 'Package2'
> & {
  HasMetadataRemoved: string;
  IsPasswordProtected: string | boolean;
  IsReleased: string | boolean;
  HasPassedCodeCoverageCheck: string | boolean;
  BuildDurationInSeconds: string | number;
  CodeCoverage: string;
  NamespacePrefix: string;
  Package2Name: string;
  Version: string;
  InstallUrl: string;
  AncestorVersion: string;
  Alias: string;
  IsOrgDependent: 'N/A' | 'Yes' | 'No';
  CreatedBy: string;
};

export type PackageVersionListCommandResult = PackageVersionListDetails[];

export class PackageVersionListCommand extends SfCommand<PackageVersionListCommandResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('summary');
  public static readonly examples = messages.getMessages('examples');
  public static readonly aliases = ['force:package:beta:version:list', 'force:package:version:list'];
  public static readonly flags = {
    loglevel,
    'target-hub-org': requiredHubFlagWithDeprecations,
    'api-version': orgApiVersionFlagWithDeprecations,
    'created-last-days': Flags.integer({
      char: 'c',
      aliases: ['createdlastdays'],
      summary: packaging.getMessage('created-last-days-description'),
      description: packaging.getMessage('created-last-days-description-long'),
    }),
    concise: Flags.boolean({
      summary: messages.getMessage('conciseDescription'),
      description: messages.getMessage('conciseLongDescription'),
    }),
    'modified-last-days': Flags.integer({
      char: 'm',
      aliases: ['modifiedlastdays'],
      summary: packaging.getMessage('modified-last-days-description'),
      description: packaging.getMessage('modified-last-days-description-long'),
    }),
    packages: Flags.string({
      char: 'p',
      summary: messages.getMessage('packagesDescription'),
      description: messages.getMessage('packagesLongDescription'),
    }),
    released: Flags.boolean({
      char: 'r',
      summary: messages.getMessage('releasedDescription'),
      description: messages.getMessage('releasedLongDescription'),
    }),
    'order-by': Flags.string({
      // eslint-disable-next-line sf-plugin/dash-o
      char: 'o',
      aliases: ['orderby'],
      summary: messages.getMessage('order-by-description'),
      description: messages.getMessage('order-by-description-long'),
    }),
    verbose: Flags.boolean({
      summary: messages.getMessage('verbose-description'),
      description: messages.getMessage('verbose-description-long'),
    }),
  };

  public async run(): Promise<PackageVersionListCommandResult> {
    const { flags } = await this.parse(PackageVersionListCommand);
    const connection = flags['target-hub-org'].getConnection(flags['api-version']);
    const project = SfProject.getInstance();

    const records = await Package.listVersions(connection, project, {
      createdLastDays: flags['created-last-days'] as number,
      concise: flags.concise,
      modifiedLastDays: flags['modified-last-days'] as number,
      packages: flags.packages?.split(' ') ?? [],
      isReleased: flags.released,
      orderBy: flags['order-by'] as string,
      verbose: flags.verbose,
    });

    const results: PackageVersionListCommandResult = [];

    if (records?.length > 0) {
      let ancestorVersionsMap: Optional<Map<string, string>>;
      // lookup ancestorVersions if ancestorIds are present
      const ancestorIds = records.filter((record) => record.AncestorId).map((record) => record.AncestorId);
      if (ancestorIds?.length > 0) {
        ancestorVersionsMap = await getPackageVersionStrings(ancestorIds, connection);
      }

      // Get the container options for each package version. We need this for determining if the version is OrgDependent
      const recordIds = [...new Set(records.map((record) => record.Package2Id))];
      const containerOptionsMap = await getContainerOptions(recordIds, connection);

      records.forEach((record) => {
        const ids = [record.Id, record.SubscriberPackageVersionId];
        const aliases: string[] = ids.map((id) => project.getAliasesFromPackageId(id)).flat();
        const AliasStr = aliases.length > 0 ? aliases.join() : '';

        // set Ancestor display values
        let ancestorVersion: Optional<string>;
        if (record.AncestorId) {
          ancestorVersion = ancestorVersionsMap?.get(record.AncestorId);
        } else if (containerOptionsMap.get(record.Package2Id) !== 'Managed') {
          // display N/A if package is unlocked
          ancestorVersion = 'N/A';
          record.AncestorId = 'N/A';
        }

        const codeCoverage =
          record.CodeCoverage?.apexCodeCoveragePercentage != null
            ? `${record.CodeCoverage.apexCodeCoveragePercentage.toString()}%`
            : record.Package2.IsOrgDependent || record.ValidationSkipped
            ? 'N/A'
            : '';

        const hasPassedCodeCoverageCheck =
          record.Package2.IsOrgDependent === true || record.ValidationSkipped
            ? 'N/A'
            : record.HasPassedCodeCoverageCheck;

        const isOrgDependent =
          containerOptionsMap.get(record.Package2Id) === 'Managed'
            ? 'N/A'
            : record.Package2.IsOrgDependent
            ? 'Yes'
            : 'No';

        const hasMetadataRemoved =
          containerOptionsMap.get(record.Package2Id) !== 'Managed' ? 'N/A' : record.HasMetadataRemoved ? 'Yes' : 'No';

        results.push({
          Package2Id: record.Package2Id,
          Branch: record.Branch,
          Tag: record.Tag,
          MajorVersion: record.MajorVersion,
          MinorVersion: record.MinorVersion,
          PatchVersion: record.PatchVersion,
          BuildNumber: record.BuildNumber,
          Id: record.Id,
          SubscriberPackageVersionId: record.SubscriberPackageVersionId,
          ConvertedFromVersionId: record.ConvertedFromVersionId,
          Name: record.Name,
          NamespacePrefix: record.Package2.NamespacePrefix,
          Package2Name: record.Package2.Name,
          Description: record.Description,
          Version: [record.MajorVersion, record.MinorVersion, record.PatchVersion, record.BuildNumber].join('.'),
          // Table output needs string false to display 'false'
          IsPasswordProtected: flags.json ? record.IsPasswordProtected : record.IsPasswordProtected.toString(),
          IsReleased: flags.json ? record.IsReleased : record.IsReleased.toString(),
          CreatedDate: new Date(record.CreatedDate).toISOString().replace('T', ' ').substring(0, 16),
          LastModifiedDate: new Date(record.LastModifiedDate).toISOString().replace('T', ' ').substring(0, 16),
          InstallUrl: INSTALL_URL_BASE.toString() + record.SubscriberPackageVersionId,
          CodeCoverage: codeCoverage,
          HasPassedCodeCoverageCheck: hasPassedCodeCoverageCheck as string | boolean,
          ValidationSkipped: record.ValidationSkipped,
          AncestorId: record.AncestorId,
          AncestorVersion: ancestorVersion as string,
          Alias: AliasStr,
          IsOrgDependent: isOrgDependent,
          ReleaseVersion: record.ReleaseVersion == null ? '' : Number.parseFloat(record.ReleaseVersion).toFixed(1),
          BuildDurationInSeconds: record.BuildDurationInSeconds == null ? '' : record.BuildDurationInSeconds,
          HasMetadataRemoved: hasMetadataRemoved,
          CreatedBy: record.CreatedById,
          Language: record.Language,
        });
      });
      this.styledHeader(`Package Versions [${results.length}]`);
      this.table(results, this.getColumnData(flags.concise, flags.verbose), { 'no-truncate': true });
    } else {
      this.warn('No results found');
    }

    return results;
  }

  // eslint-disable-next-line class-methods-use-this
  private getColumnData(concise: boolean, verbose: boolean): CliUx.Table.table.Columns<Record<string, unknown>> {
    if (concise) {
      return {
        Package2Id: { header: messages.getMessage('package-id') },
        Version: { header: messages.getMessage('version') },
        SubscriberPackageVersionId: {
          header: messages.getMessage('subscriberPackageVersionId'),
        },
        IsReleased: { header: 'Released' },
      };
    }
    const defaultCols = {
      Package2Name: { header: 'Package Name' },
      NamespacePrefix: { header: 'Namespace' },
      Name: { header: 'Version Name' },
      Version: { header: messages.getMessage('version') },
      SubscriberPackageVersionId: {
        header: messages.getMessage('subscriberPackageVersionId'),
      },
      Alias: { header: messages.getMessage('alias') },
      IsPasswordProtected: { header: messages.getMessage('installKey') },
      IsReleased: { header: 'Released' },
      ValidationSkipped: { header: messages.getMessage('validationSkipped') },
      AncestorId: { header: 'Ancestor' },
      AncestorVersion: { header: 'Ancestor Version' },
      Branch: { header: messages.getMessage('packageBranch') },
    };

    if (!verbose) {
      return defaultCols;
    } else {
      // add additional columns for verbose output
      return {
        ...defaultCols,
        Package2Id: { header: messages.getMessage('package-id') },
        InstallUrl: { header: messages.getMessage('installUrl') },
        Id: { header: messages.getMessage('id') },
        CreatedDate: { header: 'Created Date' },
        LastModifiedDate: { header: 'Last Modified Date' },
        Tag: { header: messages.getMessage('packageTag') },
        Description: { header: messages.getMessage('description') },
        CodeCoverage: { header: messages.getMessage('codeCoverage') },
        HasPassedCodeCoverageCheck: {
          header: messages.getMessage('hasPassedCodeCoverageCheck'),
        },
        ConvertedFromVersionId: {
          header: messages.getMessage('convertedFromVersionId'),
        },
        IsOrgDependent: { header: messages.getMessage('isOrgDependent') },
        ReleaseVersion: { header: messages.getMessage('releaseVersion') },
        BuildDurationInSeconds: {
          header: messages.getMessage('buildDurationInSeconds'),
        },
        HasMetadataRemoved: {
          header: messages.getMessage('hasMetadataRemoved'),
        },
        CreatedBy: { header: messages.getMessage('createdBy') },
        Language: { header: messages.getMessage('language') },
      };
    }
  }
}
