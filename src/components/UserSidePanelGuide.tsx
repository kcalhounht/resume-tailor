import { ADD_TO_CHROME_HREF } from "@/lib/chrome-webstore";

export function UserSidePanelGuide({
  storeReady,
}: {
  storeReady: boolean;
}) {
  return (
    <aside className="side-panel-guide">
      <h2>Use it on the right</h2>
      <ol className="install-steps">
        <li>You are signed in to Resume Tailor.</li>
        <li>
          Click <strong>Add to Chrome</strong> in the header.
        </li>
        <li>
          Confirm Chrome’s prompt. Chrome adds the Resume Tailor avatar to
          Extensions.
        </li>
        <li>
          Click that avatar. The app docks on the right of your current tab.
        </li>
      </ol>
      {storeReady ? (
        <p>
          <a className="primary install-store-btn" href={ADD_TO_CHROME_HREF}>
            Add to Chrome
          </a>
        </p>
      ) : (
        <p className="hint">
          Chrome’s confirm step needs a Web Store listing. Until the owner
          connects that listing, this button cannot add the avatar for you.
        </p>
      )}
    </aside>
  );
}
