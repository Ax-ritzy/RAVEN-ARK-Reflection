"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Modal from "./Modal";
import InteractiveButton from "./InteractiveButton";

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ChangePasswordModal({ isOpen, onClose }: ChangePasswordModalProps) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Authentication required. Please sign in again.");

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("auth_user_id", user.id)
        .single();

      if (profile?.role === "REFERENCE_CONTRIBUTOR") {
        throw new Error("Reference contributor accounts are managed by faculty and cannot change their password.");
      }

      const { error: updateErr } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateErr) throw new Error(updateErr.message);

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setNewPassword("");
        setConfirmPassword("");
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || "Failed to update password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <form onSubmit={handleUpdate} className="space-y-4">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Change Account Password
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Update the login password for your authenticated account.
          </p>
        </div>

        {error && (
          <div className="p-3 text-xs font-semibold rounded-xl bg-red-50 text-red-600 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/50">
            {error}
          </div>
        )}

        {success && (
          <div className="p-3 text-xs font-semibold rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50">
            ✓ Password updated successfully!
          </div>
        )}

        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
            New Password
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Enter new password (min. 6 characters)"
            className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
            required
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
            Confirm New Password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter new password"
            className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
            required
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <InteractiveButton variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </InteractiveButton>
          <InteractiveButton variant="primary" type="submit" disabled={saving}>
            {saving ? "Updating..." : "Update Password"}
          </InteractiveButton>
        </div>
      </form>
    </Modal>
  );
}
