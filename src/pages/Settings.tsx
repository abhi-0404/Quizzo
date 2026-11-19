import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/use-theme-transition";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AppLayout } from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  User, Users, Settings as SettingsIcon,
  Shield, Loader2, Camera,
} from "lucide-react";

// ─── Profile Tab ────────────────────────────────────────────────────────────────

function ProfileTab() {
  const { user, profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: "Invalid file type", description: "Please upload a JPG, PNG, WebP, or GIF image.", variant: "destructive" });
      return;
    }

    const maxSize = 5 * 1024 * 1024; // 5 MB
    if (file.size > maxSize) {
      toast({ title: "File too large", description: "Avatar must be under 5 MB.", variant: "destructive" });
      return;
    }

    const allowedExts = ["jpg", "jpeg", "png", "webp", "gif"];
    const fileExt = (file.name.split(".").pop() || "").toLowerCase();
    if (!allowedExts.includes(fileExt)) {
      toast({ title: "Invalid file extension", description: "Please upload a JPG, PNG, WebP, or GIF image.", variant: "destructive" });
      return;
    }

    setUploadingAvatar(true);
    const filePath = `${user.id}/avatar.${fileExt}`;
    const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, file, { upsert: true });
    if (uploadError) { toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" }); setUploadingAvatar(false); return; }
    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
    const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;
    const { error: updateError } = await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("user_id", user.id);
    setUploadingAvatar(false);
    if (updateError) toast({ title: "Error", description: updateError.message, variant: "destructive" });
    else { toast({ title: "Avatar updated" }); await refreshProfile(); }
  };

  useEffect(() => {
    if (profile) { setFullName(profile.full_name || ""); setJobTitle(profile.job_title || ""); }
  }, [profile]);

  const initials = fullName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ full_name: fullName, job_title: jobTitle }).eq("user_id", user.id);
    setSaving(false);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Profile updated" }); await refreshProfile(); }
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) { toast({ title: "Error", description: "Password must be at least 6 characters.", variant: "destructive" }); return; }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Password updated" }); setNewPassword(""); }
  };

  return (
    <div className="divide-y divide-border">
      <div className="px-4 md:px-6 py-4">
        <p className="text-[12px] text-muted-foreground font-medium mb-3">Profile Information</p>
        <div className="flex items-center gap-3 mb-4">
          <div className="relative group">
            <Avatar className="h-10 w-10">
              <AvatarImage src={profile?.avatar_url || ""} className="object-contain" />
              <AvatarFallback className="text-[12px]">{initials || "?"}</AvatarFallback>
            </Avatar>
            <label htmlFor="avatar-upload" className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
              {uploadingAvatar ? <Loader2 className="h-3.5 w-3.5 animate-spin text-white" /> : <Camera className="h-3.5 w-3.5 text-white" />}
            </label>
            <input id="avatar-upload" type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
          </div>
          <div>
            <p className="text-[13px] font-medium">{fullName || "Your Name"}</p>
            <p className="text-[12px] text-muted-foreground">{user?.email}</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 max-w-lg">
          <div className="space-y-1">
            <Label className="text-[12px]">Full Name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" className="h-8 text-[13px]" />
          </div>
          <div className="space-y-1">
            <Label className="text-[12px]">Job Title</Label>
            <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. BS Data Science student" className="h-8 text-[13px]" />
          </div>
        </div>
        <Button onClick={handleSaveProfile} disabled={saving} size="sm" className="h-7 text-[12px] mt-3">
          {saving && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />} Save
        </Button>
      </div>

      <div className="px-4 md:px-6 py-4">
        <p className="text-[12px] text-muted-foreground font-medium mb-3">Change Password</p>
        <div className="max-w-xs space-y-1">
          <Label className="text-[12px]">New Password</Label>
          <PasswordInput value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" className="h-8 text-[13px]" />
        </div>
        <Button onClick={handleChangePassword} disabled={changingPassword} variant="outline" size="sm" className="h-7 text-[12px] mt-3">
          {changingPassword && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />} Update Password
        </Button>
      </div>
    </div>
  );
}

// ─── Team Tab ───────────────────────────────────────────────────────────────────

type TeamMember = { user_id: string; full_name: string; job_title: string; avatar_url: string; role: string };

function TeamTab() {
  const { user } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("get_team_members");
      setMembers(data || []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="divide-y divide-border">
      <div className="px-4 md:px-6 py-4">
        <p className="text-[12px] text-muted-foreground font-medium mb-1">Add reviewers</p>
        <p className="text-[12px] text-muted-foreground max-w-lg">
          Contributors check answer keys and upload worked solutions. They are added by email on their own page.
        </p>
        <Link to="/admin/contributors" className="mt-2 inline-block text-[12px] font-medium underline underline-offset-2">
          Add contributors here
        </Link>
      </div>

      <div className="px-4 md:px-6 py-4">
        <p className="text-[12px] text-muted-foreground font-medium mb-3">Team Members · {members.length}</p>
        <div className="space-y-1">
          {members.map((m) => (
            <div key={m.user_id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted">
              <div className="flex items-center gap-2">
                <Avatar className="h-5 w-5">
                  <AvatarImage src={m.avatar_url || ""} />
                  <AvatarFallback className="text-2xs">{(m.full_name || "?").split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)}</AvatarFallback>
                </Avatar>
                <span className="text-[13px] font-medium">{m.full_name || "Unnamed"}</span>
                <span className="text-[12px] text-muted-foreground">{m.job_title || ""}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="text-[10px] h-4 px-1 gap-0.5">
                  <Shield className="h-2.5 w-2.5" />{m.role}
                </Badge>
                {m.user_id === user?.id && <Badge variant="secondary" className="text-[10px] h-4 px-1">You</Badge>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── General Tab ────────────────────────────────────────────────────────────────

function GeneralTab() {
  const { theme, setTheme } = useTheme();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const deleteAccount = async () => {
    if (!user) return;
    setDeleting(true);
    try {
      // Best effort: remove the avatar file(s); the account row removal below
      // cascades to the profile, roles and attempts.
      const { data: files } = await supabase.storage.from("avatars").list(user.id);
      if (files?.length) {
        await supabase.storage.from("avatars").remove(files.map((f) => `${user.id}/${f.name}`));
      }
      const { error } = await supabase.rpc("delete_my_account");
      if (error) throw error;
      await signOut().catch(() => undefined);
      toast({ title: "Account deleted", description: "Your account and data have been removed." });
      navigate("/", { replace: true });
    } catch (e) {
      toast({
        title: "Could not delete the account",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
      setDeleting(false);
    }
  };

  return (
    <div className="divide-y divide-border">
      <div className="px-4 md:px-6 py-4">
        <p className="text-[12px] text-muted-foreground font-medium mb-3">Appearance</p>
        <div className="flex items-center justify-between max-w-lg">
          <span className="text-[13px]">Theme</span>
          <Select value={theme === "light" ? "light" : "dark"} onValueChange={setTheme}>
            <SelectTrigger className="w-[100px] h-7 text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="light">Light</SelectItem><SelectItem value="dark">Dark</SelectItem></SelectContent>
          </Select>
        </div>
      </div>

      <div className="px-4 md:px-6 py-4">
        <p className="text-[12px] text-destructive font-medium mb-3">Danger Zone</p>
        <div className="flex items-center justify-between gap-3 max-w-lg border border-destructive/20 rounded-md p-3">
          <div>
            <p className="text-[13px] font-medium">Delete account</p>
            <p className="text-[12px] text-muted-foreground">Permanently delete your account, profile and attempt history. This cannot be undone.</p>
          </div>
          <AlertDialog onOpenChange={(o) => { if (!o) setConfirmText(""); }}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="h-7 text-[12px] shrink-0">Delete</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  Your profile and every attempt you have saved will be removed for good. Type <strong>DELETE</strong> to confirm.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" className="h-8 text-[13px]" autoComplete="off" />
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={confirmText !== "DELETE" || deleting}
                  onClick={(e) => { e.preventDefault(); void deleteAccount(); }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleting ? "Deleting…" : "Delete account"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}

// ─── Main Settings Page ─────────────────────────────────────────────────────────

export default function Settings() {
  // Team is an admin tool; the database refuses it to everyone else, so don't
  // offer it.
  const { isAdmin } = useAuth();
  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="px-4 md:px-6 h-11 border-b border-border flex items-center shrink-0">
          <h1 className="text-[13px] font-medium">Settings</h1>
        </div>

        <div className="flex-1 overflow-auto">
          <Tabs defaultValue="profile" className="flex flex-col md:flex-row h-full">
            <div className="md:w-44 shrink-0 border-b md:border-b-0 md:border-r border-border">
              <TabsList className="flex md:flex-col items-stretch w-full border-0 bg-transparent h-auto p-1.5 gap-px">
                <TabsTrigger value="profile" className="justify-start gap-1.5 text-[12px] h-7 px-2 data-[state=active]:border-transparent data-[state=active]:bg-muted w-full">
                  <User className="h-3.5 w-3.5" /> Profile
                </TabsTrigger>
                {isAdmin && (<TabsTrigger value="team" className="justify-start gap-1.5 text-[12px] h-7 px-2 data-[state=active]:border-transparent data-[state=active]:bg-muted w-full">
                  <Users className="h-3.5 w-3.5" /> Team
                </TabsTrigger>)}
                <TabsTrigger value="general" className="justify-start gap-1.5 text-[12px] h-7 px-2 data-[state=active]:border-transparent data-[state=active]:bg-muted w-full">
                  <SettingsIcon className="h-3.5 w-3.5" /> General
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 min-w-0">
              <TabsContent value="profile" className="m-0"><ProfileTab /></TabsContent>
              {isAdmin && <TabsContent value="team" className="m-0"><TeamTab /></TabsContent>}
              <TabsContent value="general" className="m-0"><GeneralTab /></TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </AppLayout>
  );
}
