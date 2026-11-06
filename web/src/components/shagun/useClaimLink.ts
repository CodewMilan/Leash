"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { GiftView } from "@/lib/types";
import { claimLinkFor } from "./giftFlow";

export function useClaimLink(gift: GiftView | null) {
  const [value, setValue] = useState({ giftId: "", link: "", qr: "" });
  useEffect(() => {
    let active = true;
    const id = gift?.id || "";
    const link =
      gift?.createdTx && gift.status === "sent" && !gift.claimPending ? claimLinkFor(id) : "";
    queueMicrotask(() => {
      if (active) setValue({ giftId: id, link, qr: "" });
    });
    if (link)
      void QRCode.toDataURL(link, { width: 240, margin: 2, errorCorrectionLevel: "M" })
        .then((qr) => {
          if (active) setValue({ giftId: id, link, qr });
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [gift?.id, gift?.createdTx, gift?.status, gift?.claimPending]);
  return value.giftId === gift?.id ? value : { giftId: gift?.id || "", link: "", qr: "" };
}
