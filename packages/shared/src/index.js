import { z } from "zod";
export const eventStatuses = ["pending", "confirmed", "cancelled", "completed"];
export const assignmentRoles = ["technician", "assembler", "driver", "pickup_teardown", "support", "lead"];
export const availabilityStatuses = ["pending", "approved", "rejected", "cancelled"];
export const confirmationStatuses = ["pending_read", "read", "confirmed"];
export const eventScheduleTypes = ["prueba", "montaje", "bolo", "desmontaje"];
export const loginSchema = z.object({
    identifier: z.string().trim().min(2).max(80),
    password: z.string().min(4)
});
export const changePasswordSchema = z.object({
    currentPassword: z.string().min(4),
    newPassword: z.string().min(4),
    confirmPassword: z.string().min(4)
}).refine((value) => value.newPassword === value.confirmPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmPassword"]
}).refine((value) => value.currentPassword !== value.newPassword, {
    message: "La nueva contraseña debe ser distinta.",
    path: ["newPassword"]
});
export const profileColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const profileUpdateSchema = z.object({
    profileColor: profileColorSchema
});
export const eventSchema = z.object({
    title: z.string().min(2).max(160),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    city: z.string().min(1).max(100),
    venueName: z.string().min(1).max(160),
    venueAddress: z.string().max(260).optional().nullable(),
    venuePlaceId: z.string().uuid().optional().nullable(),
    hotelName: z.string().max(160).optional().nullable(),
    hotelAddress: z.string().max(260).optional().nullable(),
    hotelPlaceId: z.string().uuid().optional().nullable(),
    status: z.enum(eventStatuses).default("pending"),
    visibleNotes: z.string().max(4000).optional().nullable(),
    internalNotes: z.string().max(4000).optional().nullable(),
    gearNotes: z.string().max(4000).optional().nullable(),
    segments: z.array(z.object({
        type: z.enum(eventScheduleTypes),
        startsAt: z.string().datetime(),
        endsAt: z.string().datetime(),
        notes: z.string().max(1000).optional().nullable()
    }).refine((value) => new Date(value.endsAt) > new Date(value.startsAt), {
        message: "La hora de fin debe ser posterior al inicio.",
        path: ["endsAt"]
    })).default([]),
    logistics: z.object({
        departureAt: z.string().datetime().optional().nullable(),
        arrivalAt: z.string().datetime().optional().nullable(),
        returnAt: z.string().datetime().optional().nullable(),
        contactName: z.string().max(120).optional().nullable(),
        contactPhone: z.string().max(40).optional().nullable(),
        venuePhone: z.string().max(40).optional().nullable(),
        budgetCents: z.number().int().nonnegative().optional().nullable()
    }).default({}),
    tags: z.array(z.string().min(1).max(40)).default([]),
    assignments: z.array(z.object({
        userId: z.string().uuid().optional().nullable(),
        externalName: z.string().min(2).max(120).optional().nullable(),
        externalPhone: z.string().max(40).optional().nullable(),
        role: z.enum(assignmentRoles),
        segmentType: z.enum(eventScheduleTypes).optional().nullable(),
        saveFreelance: z.boolean().optional().nullable(),
        personalNotes: z.string().max(1000).optional().nullable(),
        departureAt: z.string().datetime().optional().nullable(),
        arrivalAt: z.string().datetime().optional().nullable(),
        logisticsNotes: z.string().max(1000).optional().nullable()
    }).refine((value) => Boolean(value.userId || value.externalName?.trim()), {
        message: "El asignado necesita usuario o nombre freelance.",
        path: ["userId"]
    })).default([]),
    forceConflicts: z.boolean().default(false)
}).refine((value) => new Date(value.endsAt) > new Date(value.startsAt), {
    message: "La hora de fin debe ser posterior al inicio.",
    path: ["endsAt"]
});
export const availabilityRequestSchema = z.object({
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    reason: z.string().max(1000).optional().nullable()
}).refine((value) => new Date(value.endsAt) > new Date(value.startsAt), {
    message: "La franja debe tener fin posterior al inicio.",
    path: ["endsAt"]
});
export const availabilityResolutionSchema = z.object({
    status: z.enum(["approved", "rejected"]),
    resolutionComment: z.string().max(1000).optional().nullable()
});
export const userCreateSchema = z.object({
    name: z.string().min(2).max(120),
    email: z.string().email(),
    phone: z.string().max(40).optional().nullable(),
    profileColor: profileColorSchema.optional(),
    roleKeys: z.array(z.string().min(2)).min(1),
    password: z.string().min(4)
});
export const userUpdateSchema = z.object({
    name: z.string().min(2).max(120),
    email: z.string().email(),
    phone: z.string().max(40).optional().nullable(),
    profileColor: profileColorSchema.optional(),
    roleKeys: z.array(z.string().min(2)).min(1),
    isActive: z.boolean()
});
export const rolePermissionsSchema = z.object({
    permissionKeys: z.array(z.string().min(2))
});
