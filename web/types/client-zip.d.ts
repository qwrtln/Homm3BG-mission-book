// The subset of client-zip (app/vendor/client-zip/, CLIENT_ZIP_VERSION in
// web/vendor.env) that the PNG export calls. The module is imported by URL
// at run time, so the type checker never reads the vendored build itself.

interface ClientZipModule {
  downloadZip(files: Iterable<{ name: string; input: Uint8Array; lastModified?: Date }>): Response;
}
