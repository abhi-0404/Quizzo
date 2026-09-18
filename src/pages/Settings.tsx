import { useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  User, GraduationCap, Users, Bell, Settings as SettingsIcon,
  Mail, Trash2, Shield, Send, AlertTriangle, Loader2, Camera,
  Megaphone, Plus, X
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
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Doe" className="h-8 text-[13px]" />
          </div>
          <div className="space-y-1">
            <Label className="text-[12px]">Job Title</Label>
            <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Software Engineer" className="h-8 text-[13px]" />
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

// ─── Institution Tab ────────────────────────────────────────────────────────────
// Static UI (no backend) — manages platform-level details and academic terms.

function InstitutionTab() {
  const [platformName, setPlatformName] = useState("Quizo");
  const [institution, setInstitution] = useState("IIT Madras — Online Degree");
  const [supportEmail, setSupportEmail] = useState("support@quizo.app");
  const [terms, setTerms] = useState<string[]>(["Jan 2025", "May 2025", "Sep 2024"]);
  const [newTerm, setNewTerm] = useState("");

  const addTerm = () => {
    const t = newTerm.trim();
    if (t && !terms.includes(t)) setTerms((prev) => [...prev, t]);
    setNewTerm("");
  };
  const removeTerm = (t: string) => setTerms((prev) => prev.filter((x) => x !== t));

  return (
    <div className="divide-y divide-border">
      <div className="px-4 md:px-6 py-4">
        <p className="text-[12px] text-muted-foreground font-medium mb-3">Platform Details</p>
        <div className="grid gap-3 sm:grid-cols-2 max-w-lg">
          <div className="space-y-1"><Label className="text-[12px]">Platform Name</Label>
            <Input value={platformName} onChange={(e) => setPlatformName(e.target.value)} placeholder="Quizo" className="h-8 text-[13px]" /></div>
          <div className="space-y-1"><Label className="text-[12px]">Institution</Label>
            <Input value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="Institution name" className="h-8 text-[13px]" /></div>
          <div className="space-y-1 sm:col-span-2"><Label className="text-[12px]">Support Email</Label>
            <Input value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} placeholder="support@example.com" className="h-8 text-[13px]" /></div>
        </div>
      </div>

      <div className="px-4 md:px-6 py-4">
        <p className="text-[12px] text-muted-foreground font-medium mb-3">Active Academic Terms</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {terms.map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-[12px] text-foreground">
              {t}
              <button onClick={() => removeTerm(t)} className="text-muted-foreground hover:text-foreground" aria-label={`Remove ${t}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {terms.length === 0 && <span className="text-[12px] text-muted-foreground">No active terms.</span>}
        </div>
        <div className="flex gap-2 max-w-sm">
          <Input
            value={newTerm}
            onChange={(e) => setNewTerm(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTerm(); } }}
            placeholder="e.g. Jan 2026"
            className="h-8 text-[13px] flex-1"
          />
          <Button onClick={addTerm} disabled={!newTerm.trim()} size="sm" variant="outline" className="h-8 text-[12px] gap-1">
            <Plus className="h-3 w-3" /> Add
          </Button>
        </div>
      </div>

      <div className="px-4 md:px-6 py-4">
        <Button onClick={() => toast({ title: "Institution settings saved" })} size="sm" className="h-7 text-[12px]">
          Save Changes
        </Button>
      </div>
    </div>
  );
}

// ─── Team Tab ───────────────────────────────────────────────────────────────────

function TeamTab() {
  const { user } = useAuth();
  const [members, setMembers] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("user");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const fetchData = async () => {
    const [teamRes, invitationsRes] = await Promise.all([
      supabase.rpc("get_team_members"),
      supabase.from("invitations").select("*").eq("status", "pending"),
    ]);
    setMembers(teamRes.data || []);
    setInvitations(invitationsRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleInvite = async () => {
    if (!user || !inviteEmail) return;
    setSending(true);
    const { error } = await supabase.from("invitations").insert({ email: inviteEmail, role: inviteRole as any, invited_by: user.id });
    setSending(false);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Invitation sent", description: `Invited ${inviteEmail}` }); setInviteEmail(""); fetchData(); }
  };

  const handleRevoke = async (id: string) => {
    const { error } = await supabase.from("invitations").delete().eq("id", id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Invitation revoked" }); fetchData(); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="divide-y divide-border">
      <div className="px-4 md:px-6 py-4">
        <p className="text-[12px] text-muted-foreground font-medium mb-3">Invite Team Member</p>
        <div className="flex gap-2 max-w-lg">
          <Input placeholder="colleague@company.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="h-8 text-[13px] flex-1" />
          <Select value={inviteRole} onValueChange={setInviteRole}>
            <SelectTrigger className="w-[100px] h-8 text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="user">User</SelectItem><SelectItem value="moderator">Moderator</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent>
          </Select>
          <Button onClick={handleInvite} disabled={sending || !inviteEmail} size="sm" className="h-8 text-[12px] gap-1">
            {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Invite
          </Button>
        </div>
      </div>

      {invitations.length > 0 && (
        <div className="px-4 md:px-6 py-4">
          <p className="text-[12px] text-muted-foreground font-medium mb-3">Pending Invitations</p>
          <div className="space-y-1">
            {invitations.map((inv: any) => (
              <div key={inv.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted">
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[13px]">{inv.email}</span>
                  <Badge variant="outline" className="text-[10px] h-4 px-1">{inv.role}</Badge>
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleRevoke(inv.id)} className="h-6 w-6 p-0">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="px-4 md:px-6 py-4">
        <p className="text-[12px] text-muted-foreground font-medium mb-3">Team Members · {members.length}</p>
        <div className="space-y-1">
          {members.map((m: any) => (
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

// ─── Notifications Tab ──────────────────────────────────────────────────────────
// Static UI (no backend) — compose a global broadcast to students.

function NotificationsTab() {
  const [audience, setAudience] = useState("all");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const AUDIENCES: Record<string, string> = {
    all: "All Students",
    ds: "Data Science Cohort",
    active: "Students with Active Exams",
  };

  const RECENT = [
    { audience: "All Students", text: "May 2025 term results are now published.", when: "2 days ago" },
    { audience: "Data Science Cohort", text: "Quiz 2 window opens Monday at 9 AM.", when: "5 days ago" },
  ];

  const handleSend = () => {
    if (!message.trim()) {
      toast({ title: "Empty message", description: "Write something before broadcasting.", variant: "destructive" });
      return;
    }
    setSending(true);
    setTimeout(() => {
      setSending(false);
      toast({ title: "Broadcast sent", description: `Delivered to: ${AUDIENCES[audience]}` });
      setMessage("");
    }, 500);
  };

  return (
    <div className="divide-y divide-border">
      <div className="px-4 md:px-6 py-3 flex items-start gap-2 bg-muted">
        <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-[12px] text-muted-foreground">Delivery provider not yet connected. Broadcasts are composed here and queued once messaging is configured.</p>
      </div>

      <div className="px-4 md:px-6 py-4">
        <p className="text-[12px] text-muted-foreground font-medium mb-3">Global Broadcast</p>
        <div className="max-w-lg space-y-3">
          <div className="space-y-1">
            <Label className="text-[12px]">Audience</Label>
            <Select value={audience} onValueChange={setAudience}>
              <SelectTrigger className="h-8 text-[13px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(AUDIENCES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[12px]">Message</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write an announcement for students…"
              rows={4}
              maxLength={1000}
              className="text-[13px] resize-none"
            />
          </div>
          <Button onClick={handleSend} disabled={sending} size="sm" className="h-8 text-[12px] gap-1.5">
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Megaphone className="h-3.5 w-3.5" />}
            Send Global Broadcast to Students
          </Button>
        </div>
      </div>

      <div className="px-4 md:px-6 py-4">
        <p className="text-[12px] text-muted-foreground font-medium mb-3">Recent Broadcasts</p>
        <div className="space-y-1">
          {RECENT.map((b, i) => (
            <div key={i} className="flex items-start justify-between gap-3 py-2 px-2 rounded hover:bg-muted">
              <div className="min-w-0">
                <p className="text-[13px] truncate">{b.text}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{b.audience}</p>
              </div>
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">{b.when}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── General Tab ────────────────────────────────────────────────────────────────

function GeneralTab() {
  const [theme, setThemeState] = useState<string>(() => {
    if (typeof window !== "undefined") return document.documentElement.classList.contains("dark") ? "dark" : "light";
    return "dark";
  });

  const toggleTheme = (value: string) => {
    setThemeState(value);
    if (value === "dark") { document.documentElement.classList.add("dark"); localStorage.setItem("theme", "dark"); }
    else { document.documentElement.classList.remove("dark"); localStorage.setItem("theme", "light"); }
  };

  return (
    <div className="divide-y divide-border">
      <div className="px-4 md:px-6 py-4">
        <p className="text-[12px] text-muted-foreground font-medium mb-3">Appearance</p>
        <div className="flex items-center justify-between max-w-lg">
          <span className="text-[13px]">Theme</span>
          <Select value={theme} onValueChange={toggleTheme}>
            <SelectTrigger className="w-[100px] h-7 text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="light">Light</SelectItem><SelectItem value="dark">Dark</SelectItem></SelectContent>
          </Select>
        </div>
      </div>

      <div className="px-4 md:px-6 py-4">
        <p className="text-[12px] text-muted-foreground font-medium mb-3">Defaults</p>
        <div className="grid gap-3 sm:grid-cols-2 max-w-lg">
          <div className="space-y-1"><Label className="text-[12px]">Default Difficulty</Label>
            <Select defaultValue="medium"><SelectTrigger className="h-8 text-[13px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="easy">Easy</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="hard">Hard</SelectItem></SelectContent></Select></div>
          <div className="space-y-1"><Label className="text-[12px]">Default Exam Duration</Label>
            <Select defaultValue="60"><SelectTrigger className="h-8 text-[13px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="30">30 minutes</SelectItem><SelectItem value="60">60 minutes</SelectItem><SelectItem value="90">90 minutes</SelectItem><SelectItem value="120">120 minutes</SelectItem></SelectContent></Select></div>
        </div>
      </div>

      <div className="px-4 md:px-6 py-4">
        <p className="text-[12px] text-destructive font-medium mb-3">Danger Zone</p>
        <div className="flex items-center justify-between max-w-lg border border-destructive/20 rounded-md p-3">
          <div>
            <p className="text-[13px] font-medium">Delete Account</p>
            <p className="text-[12px] text-muted-foreground">Permanently delete your account and all data.</p>
          </div>
          <Button variant="destructive" size="sm" disabled className="h-7 text-[12px]">Coming Soon</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Settings Page ─────────────────────────────────────────────────────────

export default function Settings() {
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
                <TabsTrigger value="institution" className="justify-start gap-1.5 text-[12px] h-7 px-2 data-[state=active]:border-transparent data-[state=active]:bg-muted w-full">
                  <GraduationCap className="h-3.5 w-3.5" /> Institution
                </TabsTrigger>
                <TabsTrigger value="team" className="justify-start gap-1.5 text-[12px] h-7 px-2 data-[state=active]:border-transparent data-[state=active]:bg-muted w-full">
                  <Users className="h-3.5 w-3.5" /> Team
                </TabsTrigger>
                <TabsTrigger value="notifications" className="justify-start gap-1.5 text-[12px] h-7 px-2 data-[state=active]:border-transparent data-[state=active]:bg-muted w-full">
                  <Bell className="h-3.5 w-3.5" /> Notifications
                </TabsTrigger>
                <TabsTrigger value="general" className="justify-start gap-1.5 text-[12px] h-7 px-2 data-[state=active]:border-transparent data-[state=active]:bg-muted w-full">
                  <SettingsIcon className="h-3.5 w-3.5" /> General
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 min-w-0">
              <TabsContent value="profile" className="m-0"><ProfileTab /></TabsContent>
              <TabsContent value="institution" className="m-0"><InstitutionTab /></TabsContent>
              <TabsContent value="team" className="m-0"><TeamTab /></TabsContent>
              <TabsContent value="notifications" className="m-0"><NotificationsTab /></TabsContent>
              <TabsContent value="general" className="m-0"><GeneralTab /></TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </AppLayout>
  );
}
