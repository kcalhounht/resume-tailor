export default function SignOutButton() {
  // Full document GET so Next.js does not try to stream /api/auth/clear as RSC.
  return (
    <a href="/api/auth/clear" className="text-btn">
      Sign out
    </a>
  );
}
