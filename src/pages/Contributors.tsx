import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Mail, UserPlus, Trash2, Inbox } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { AdminError, AdminLoading } from "@/components/AdminState";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  addContributor, formatWhen, initialsOf, isValidEmail, listContributors, normalizeEmail,
  removeContributor, revokeInvite,
  type ContributorRow,
} from "@/lib/contributor-admin";

const QUERY_KEY = ["admin-contributors"];

const errorText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

export default function Contributors() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");

  const { data, isLoading, error, refetch } = useQuery({ queryKey: QUERY_KEY, queryFn: listContributors });
  const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const add = useMutation({
    mutationFn: addContributor,
    onSuccess: (outcome, address) => {
      const shown = normalizeEmail(address);
      if (outcome === "granted") {
        toast.success(`${shown} is now a contributor`, {
          description: "They already had an account, so the portal is open to them now.",
        });
      } else {
        toast.success(`Invitation saved for ${shown}`, {
          description: "They have not signed in yet. They get access automatically the first time they sign in with this Google email.",
        });
      }
      setEmail("");
      void refresh();
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const remove = useMutation({
    mutationFn: removeContributor,
    onSuccess: () => {
      toast.success("Contributor removed");
      void refresh();
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const revoke = useMutation({
    mutationFn: revokeInvite,
    onSuccess: () => {
      toast.success("Invitation revoked");
      void refresh();
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const valid = isValidEmail(email);
  const submit = () => {
    if (!valid || add.isPending) return;
    add.mutate(email);
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 md:px-6 h-11 border-b border-border shrink-0">
          <h1 className="text-[13px] font-medium">Contributors</h1>
          <Button asChild size="sm" variant="outline" className="h-7 text-[12px] gap-1.5">
            <Link to="/admin/reviews">
              <Inbox className="h-3.5 w-3.5" /> Review inbox
            </Link>
          </Button>
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading && <AdminLoading />}
          {error && <AdminError message={errorText(error)} onRetry={() => void refetch()} />}

          {data && (
            <div className="p-4 md:p-6 space-y-6 max-w-[1100px]">
              {/* Add */}
              <div className="border border-border rounded-md bg-card p-4">
                <p className="text-[13px] font-medium">Add a contributor</p>
                <p className="text-[12px] text-muted-foreground mt-0.5 mb-3 max-w-xl">
                  Contributors can check the answer key of published papers and upload worked solutions as a PDF or image.
                  They cannot edit papers or see student data. Use the Google email they sign in with.
                </p>
                <div className="flex gap-2 max-w-lg">
                  <Input
                    type="email"
                    inputMode="email"
                    autoComplete="off"
                    placeholder="reviewer@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        submit();
                      }
                    }}
                    aria-label="Contributor email"
                    className="h-8 text-[13px] flex-1"
                  />
                  <Button onClick={submit} disabled={!valid || add.isPending} size="sm" className="h-8 text-[12px] gap-1.5">
                    {add.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                    Add
                  </Button>
                </div>
                {email.trim() !== "" && !valid && (
                  <p className="text-[12px] text-destructive mt-2">Enter a full email address, like name@gmail.com.</p>
                )}
              </div>

              {/* Current contributors */}
              <div>
                <p className="text-[13px] font-medium mb-2">
                  Current contributors
                  <span className="ml-2 text-[12px] font-normal text-muted-foreground">{data.contributors.length}</span>
                </p>
                <div className="border border-border rounded-md overflow-hidden">
                  {data.contributors.length === 0 ? (
                    <p className="px-3 py-8 text-center text-[12px] text-muted-foreground">
                      No contributors yet. Add someone above and they will see the Contributor portal after they sign in.
                    </p>
                  ) : (
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="border-b border-border bg-muted">
                          <th className="text-left font-medium text-muted-foreground px-3 py-2">Person</th>
                          <th className="text-left font-medium text-muted-foreground px-3 py-2 hidden md:table-cell">Joined</th>
                          <th className="text-right font-medium text-muted-foreground px-3 py-2">Reviews</th>
                          <th className="text-right font-medium text-muted-foreground px-3 py-2">Flags</th>
                          <th className="text-right font-medium text-muted-foreground px-3 py-2">Solutions</th>
                          <th className="px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {data.contributors.map((c) => (
                          <ContributorRowView
                            key={c.user_id}
                            c={c}
                            removing={remove.isPending && remove.variables === c.user_id}
                            onRemove={() => remove.mutate(c.user_id)}
                          />
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Reviews = answer keys checked. Flags = reviews that said the key is wrong.
                </p>
              </div>

              {/* Pending invitations */}
              <div>
                <p className="text-[13px] font-medium mb-2">
                  Pending invitations
                  <span className="ml-2 text-[12px] font-normal text-muted-foreground">{data.invites.length}</span>
                </p>
                <div className="border border-border rounded-md overflow-hidden">
                  {data.invites.length === 0 ? (
                    <p className="px-3 py-6 text-center text-[12px] text-muted-foreground">
                      No one is waiting. People you add who have not signed in yet will appear here.
                    </p>
                  ) : (
                    <ul>
                      {data.invites.map((inv) => (
                        <li key={inv.id} className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border last:border-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-[13px] truncate">{inv.email}</span>
                            <span className="text-[11px] text-muted-foreground whitespace-nowrap hidden sm:inline">
                              invited {formatWhen(inv.created_at)} · expires {formatWhen(inv.expires_at)}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-[12px]"
                            disabled={revoke.isPending && revoke.variables === inv.id}
                            onClick={() => revoke.mutate(inv.id)}
                          >
                            Revoke
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function ContributorRowView({ c, removing, onRemove }: { c: ContributorRow; removing: boolean; onRemove: () => void }) {
  const label = c.full_name || c.email || "this person";
  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted transition-colors">
      <td className="px-3 py-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <Avatar className="h-6 w-6">
            {c.avatar_url && <AvatarImage src={c.avatar_url} alt="" />}
            <AvatarFallback className="text-[10px]">{initialsOf(c.full_name, c.email)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="font-medium truncate">{c.full_name || "Unnamed"}</p>
            <p className="text-[12px] text-muted-foreground truncate">{c.email ?? "—"}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-2 text-muted-foreground hidden md:table-cell whitespace-nowrap">{formatWhen(c.joined_at)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{c.reviews}</td>
      <td className="px-3 py-2 text-right tabular-nums">{c.flags}</td>
      <td className="px-3 py-2 text-right tabular-nums">{c.solutions}</td>
      <td className="px-3 py-2 text-right">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-[12px] gap-1" disabled={removing} aria-label={`Remove ${label}`}>
              <Trash2 className="h-3 w-3" /> Remove
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {label} as a contributor?</AlertDialogTitle>
              <AlertDialogDescription>
                They keep their account but lose access to the Contributor portal. The reviews and solutions they already
                submitted stay in the system and can still be accepted or approved.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={onRemove}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </td>
    </tr>
  );
}
