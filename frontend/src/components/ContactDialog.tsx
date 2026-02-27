"use client";

import { ReactNode } from "react";

interface ContactDialogProps {
  trigger: ReactNode;
}

export const ContactDialog = ({ trigger }: ContactDialogProps) => {
  return (
    <div>
      {trigger}
      {/* Basic implementation for now to fix CI */}
    </div>
  );
};

export default ContactDialog;
