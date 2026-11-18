import fs from 'node:fs';
import { NtExecutable, NtExecutableResource } from 'pe-library';
import { Data, Resource } from 'resedit';
const [file, ico] = process.argv.slice(2);
const { version: appVersion } = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url)));
const [major, minor, patch] = appVersion.split('.').map(Number);
const exe = NtExecutable.from(fs.readFileSync(file), { ignoreCert: true });
const res = NtExecutableResource.from(exe),
  icons = Data.IconFile.from(fs.readFileSync(ico)).icons.map((v) => v.data);
for (const group of Resource.IconGroupEntry.fromEntries(res.entries))
  Resource.IconGroupEntry.replaceIconsForResource(res.entries, group.id, group.lang, icons);
for (const version of Resource.VersionInfo.fromEntries(res.entries)) {
  version.setStringValues(
    { lang: 1033, codepage: 1200 },
    {
      FileDescription: 'Mira Desktop',
      ProductName: 'Мира',
      InternalName: 'Mira',
      OriginalFilename: 'Mira.exe',
      ProductVersion: appVersion,
      CompanyName: 'Mira Desktop',
    },
  );
  version.setFileVersion(major, minor, patch, 0, 1033);
  version.setProductVersion(major, minor, patch, 0, 1033);
  version.outputToResourceEntries(res.entries);
}
res.outputResource(exe);
fs.writeFileSync(file, Buffer.from(exe.generate()));
