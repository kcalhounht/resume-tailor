import { signout } from "@/app/actions/auth";

export default function SignOutButton() {
  return (
    <form action={signout}>
      <button type="submit" className="text-btn">
        Sign out
      </button>
    </form>
  );
}
