import { useEffect, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";

export type SiteSection = "home" | "play" | "create" | "quizzes";

/**
 * Change an application route without asking the browser to download the
 * document again. The popstate event keeps the root router in sync with the
 * History API, including for callers that are not anchor elements.
 */
export function navigateTo(
  href: string,
  options: { replace?: boolean; notify?: boolean } = {},
) {
  const current = `${window.location.pathname}${window.location.search}`;
  if (current === href) return;
  if (options.replace) window.history.replaceState({}, "", href);
  else window.history.pushState({}, "", href);
  if (options.notify !== false) window.dispatchEvent(new Event("popstate"));
}

export function navigateInternally(
  event: MouseEvent<HTMLAnchorElement>,
  href: string,
) {
  // Keep standard browser behavior available for new-tab/window and
  // accessibility shortcuts, while normal clicks stay inside the SPA.
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  event.preventDefault();
  navigateTo(href);
}

type Props = {
  active: SiteSection;
  loggedIn: boolean;
  email?: string;
  onLogout?: () => Promise<void>;
  onLogin?: (register: boolean) => void;
  onCreate?: () => void;
  onMyQuizzes?: () => void;
  tagline?: ReactNode;
  extra?: ReactNode;
};

export function SiteHeader({
  active,
  loggedIn,
  email,
  onLogout,
  onLogin,
  onCreate,
  onMyQuizzes,
  tagline,
  extra,
}: Props) {
  const [logoutArmed, setLogoutArmed] = useState(false);
  const logoutTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(logoutTimer.current), []);
  function armLogout() {
    setLogoutArmed(true);
    window.clearTimeout(logoutTimer.current);
    logoutTimer.current = window.setTimeout(() => {
      setLogoutArmed(false);
      logoutTimer.current = undefined;
    }, 3500);
  }
  async function logout() {
    if (!onLogout) return;
    window.clearTimeout(logoutTimer.current);
    logoutTimer.current = undefined;
    await onLogout();
  }
  const navClass = (section: SiteSection) =>
    `dashboard-nav-link${active === section ? " is-active" : ""}`;
  const headerTagline = tagline ?? (
    <h1>
      Questions that matter.
      <br />
      <span className="site-tagline-indent">Engaged audiences.</span>
    </h1>
  );
  return (
    <header className="dashboard-header has-tagline">
      <nav className="header-actions" aria-label="Quizzy navigation">
        <a
          className={navClass("play")}
          href="/popular"
          onClick={(event) => navigateInternally(event, "/popular")}
          aria-current={active === "play" ? "page" : undefined}
        >
          Play
        </a>
        {loggedIn && onCreate ? (
          <button
            type="button"
            className={navClass("create")}
            onClick={onCreate}
          >
            Create quiz
          </button>
        ) : loggedIn ? (
          <a
            className={navClass("create")}
            href="/dashboard?new=1"
            onClick={(event) => navigateInternally(event, "/dashboard?new=1")}
            aria-current={active === "create" ? "page" : undefined}
          >
            Create quiz
          </a>
        ) : (
          <button
            type="button"
            className={navClass("create")}
            onClick={() => navigateTo("/create")}
          >
            Create quiz
          </button>
        )}
        {loggedIn ? (
          onMyQuizzes ? (
            <button
              type="button"
              className={navClass("quizzes")}
              onClick={onMyQuizzes}
              aria-current={active === "quizzes" ? "page" : undefined}
            >
              My quizzes
            </button>
          ) : (
            <a
              className={navClass("quizzes")}
              href="/dashboard"
              onClick={(event) => navigateInternally(event, "/dashboard")}
              aria-current={active === "quizzes" ? "page" : undefined}
            >
              My quizzes
            </a>
          )
        ) : (
          <button
            type="button"
            className={navClass("quizzes")}
            title="Sign in to view your quizzes"
            onClick={() => onLogin?.(false)}
          >
            My quizzes
          </button>
        )}
      </nav>
      <div className="dashboard-header-extra">
        {extra}
        {loggedIn && email && (
          <button
            type="button"
            className={`secondary dashboard-account-button${logoutArmed ? " is-logout-armed" : ""}`}
            title={
              logoutArmed ? "Click again to log out" : `Logged in as ${email}`
            }
            aria-label={logoutArmed ? "Log out" : `Logged in as ${email}`}
            onClick={() => {
              if (logoutArmed) void logout();
              else armLogout();
            }}
          >
            <span key={logoutArmed ? "logout" : "name"}>
              {logoutArmed ? "Logout" : email.split("@")[0]}
            </span>
          </button>
        )}
        {!loggedIn && onLogin && (
          <button
            type="button"
            className="secondary dashboard-account-button"
            onClick={() => onLogin(false)}
          >
            Log in
          </button>
        )}
      </div>
      <div className="site-tagline">{headerTagline}</div>
    </header>
  );
}
