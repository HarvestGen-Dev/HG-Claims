"use client";

import React, { useState } from "react";
import { MessageSquare, Send, Lock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ClaimComment, Profile } from "@/lib/types/database";
import { formatDateTime } from "@/lib/utils/formatters";

interface ClaimCommentsProps {
  comments: ClaimComment[];
  currentUser: Profile | null;
  onAddComment: (content: string, visibility: "PUBLIC_WORKFLOW" | "FINANCE_INTERNAL") => Promise<void> | void;
  canAddInternalNote?: boolean;
}

export function ClaimComments({
  comments,
  currentUser,
  onAddComment,
  canAddInternalNote = false,
}: ClaimCommentsProps) {
  const [content, setContent] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter comments based on user role
  const visibleComments = comments.filter(c => {
    if (c.visibility === "PUBLIC_WORKFLOW") return true;
    if (c.visibility === "FINANCE_INTERNAL") {
      return currentUser?.roles?.includes("FINANCE_OFFICER") || currentUser?.roles?.includes("SYSTEM_ADMIN");
    }
    return false;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || isSubmitting) return;

    try {
      setIsSubmitting(true);
      await onAddComment(
        content.trim(),
        isInternal ? "FINANCE_INTERNAL" : "PUBLIC_WORKFLOW"
      );
      setContent("");
      setIsInternal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-emerald-700" />
          Comments & Notes ({visibleComments.length})
        </h3>
      </div>

      {/* Comment List */}
      <div className="space-y-3">
        {visibleComments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400 dark:border-slate-800">
            No comments yet on this claim.
          </div>
        ) : (
          visibleComments.map((c) => {
            const isMe = c.author_id === currentUser?.id;
            const isInternalNote = c.visibility === "FINANCE_INTERNAL";

            return (
              <div
                key={c.id}
                className={`p-3.5 rounded-xl border text-xs ${
                  isInternalNote
                    ? "bg-amber-50/70 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900"
                    : "bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-800"
                }`}
              >
                <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      {c.author?.full_name || "User"}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      {c.author_role.replace(/_/g, " ")}
                    </span>
                    {isInternalNote && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded dark:bg-amber-900 dark:text-amber-200">
                        <Lock className="w-2.5 h-2.5" />
                        Internal Finance Note
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {formatDateTime(c.created_at)}
                  </span>
                </div>
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {c.content}
                </p>
              </div>
            );
          })
        )}
      </div>

      {/* New Comment Box */}
      <form onSubmit={handleSubmit} className="space-y-2 pt-2">
        <Textarea
          rows={2}
          placeholder="Type a message or note regarding this claim..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="text-xs"
        />

        <div className="flex items-center justify-between">
          {canAddInternalNote ? (
            <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={isInternal}
                onChange={(e) => setIsInternal(e.target.checked)}
                className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 accent-amber-600"
              />
              <span className="flex items-center gap-1">
                <Lock className="w-3 h-3 text-amber-600" />
                Make this an Internal Finance Note (Hidden from claimant)
              </span>
            </label>
          ) : (
            <div />
          )}

          <Button
            type="submit"
            size="sm"
            disabled={!content.trim() || isSubmitting}
            className="flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isSubmitting ? "Posting..." : "Post Comment"}</span>
          </Button>
        </div>
      </form>
    </div>
  );
}
