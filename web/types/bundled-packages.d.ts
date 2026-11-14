// The list of npm packages in the bundle, which the license-notices plugin in
// vite.config.ts writes into the build. The dev server lists none.

declare module "virtual:bundled-packages" {
  /** One npm package in the bundle. */
  export interface BundledPackage {
    name: string;
    version: string;
    /** The SPDX identifier, or a pointer to the text. */
    license: string;
    homepage: string;
  }
  const packages: BundledPackage[];
  export default packages;
}
