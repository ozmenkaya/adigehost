import type { Request } from "express";
import { Reservation } from "../models/Reservation";
import { ApiError } from "../middleware/errors";
import { hashAccessToken } from "./tokens";

const RESERVATION_TZ = "Europe/Istanbul";
const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function currentTrDayAndTime(now: Date): { day: number; time: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: RESERVATION_TZ,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value])) as Record<string, string>;
  const hour = map.hour === "24" ? "00" : map.hour;
  return { day: WEEKDAY_INDEX[map.weekday] ?? 0, time: `${hour}:${map.minute}` };
}

export async function reservationFromRequest(req: Request): Promise<Reservation> {
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) throw new ApiError(401, "Erişim anahtarı eksik (Authorization: Bearer ...)");

  const reservation = await Reservation.findOne({ where: { accessTokenHash: hashAccessToken(token) } });
  if (!reservation) throw new ApiError(401, "Geçersiz erişim anahtarı");
  if (reservation.status === "cancelled") throw new ApiError(403, "Rezervasyon iptal edilmiş");

  const now = new Date();
  if (now < reservation.startsAt) throw new ApiError(403, "Rezervasyon henüz başlamadı");
  if (now > reservation.endsAt) throw new ApiError(403, "Rezervasyon süresi doldu");

  if (reservation.daysOfWeek || (reservation.timeStart && reservation.timeEnd)) {
    const { day, time } = currentTrDayAndTime(now);
    if (reservation.daysOfWeek && !reservation.daysOfWeek.includes(day)) {
      throw new ApiError(403, "Rezervasyon bugün için geçerli değil");
    }
    if (reservation.timeStart && reservation.timeEnd && (time < reservation.timeStart || time >= reservation.timeEnd)) {
      throw new ApiError(403, `Rezervasyon sadece ${reservation.timeStart}–${reservation.timeEnd} saatleri arasında kullanılabilir`);
    }
  }

  return reservation;
}

export function assertReservationAllowsModel(reservation: Reservation, model: string): void {
  if (reservation.allowedModels && !reservation.allowedModels.includes(model)) {
    throw new ApiError(403, `Bu rezervasyon "${model}" modeline erişim izni vermiyor`);
  }
}
