/** The loading screen an address-named scenario shows while it is looked up; the `route-pending` class on <html> reveals it. */
export function RouteLoading() {
  return (
    <div className="route-loading" id="route-loading" role="status" aria-label="Opening your scenario">
      <span className="spinner big" />
    </div>
  );
}
