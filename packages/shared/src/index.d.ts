import { z } from "zod";
export declare const eventStatuses: readonly ["pending", "confirmed", "cancelled", "completed"];
export declare const assignmentRoles: readonly ["technician", "assembler", "driver", "pickup_teardown", "support", "lead"];
export declare const availabilityStatuses: readonly ["pending", "approved", "rejected", "cancelled"];
export declare const confirmationStatuses: readonly ["pending_read", "read", "confirmed"];
export declare const eventScheduleTypes: readonly ["prueba", "montaje", "bolo", "desmontaje"];
export declare const loginSchema: z.ZodObject<{
    identifier: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    identifier: string;
    password: string;
}, {
    identifier: string;
    password: string;
}>;
export declare const changePasswordSchema: z.ZodEffects<z.ZodEffects<z.ZodObject<{
    currentPassword: z.ZodString;
    newPassword: z.ZodString;
    confirmPassword: z.ZodString;
}, "strip", z.ZodTypeAny, {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
}, {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
}>, {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
}, {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
}>, {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
}, {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
}>;
export declare const profileColorSchema: z.ZodString;
export declare const profileUpdateSchema: z.ZodObject<{
    profileColor: z.ZodString;
}, "strip", z.ZodTypeAny, {
    profileColor: string;
}, {
    profileColor: string;
}>;
export declare const eventSchema: z.ZodEffects<z.ZodObject<{
    title: z.ZodString;
    startsAt: z.ZodString;
    endsAt: z.ZodString;
    city: z.ZodString;
    venueName: z.ZodString;
    venueAddress: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    venuePlaceId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    hotelName: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    hotelAddress: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    hotelPlaceId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    status: z.ZodDefault<z.ZodEnum<["pending", "confirmed", "cancelled", "completed"]>>;
    visibleNotes: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    internalNotes: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    gearNotes: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    segments: z.ZodDefault<z.ZodArray<z.ZodEffects<z.ZodObject<{
        type: z.ZodEnum<["prueba", "montaje", "bolo", "desmontaje"]>;
        startsAt: z.ZodString;
        endsAt: z.ZodString;
        notes: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        type: "prueba" | "montaje" | "bolo" | "desmontaje";
        startsAt: string;
        endsAt: string;
        notes?: string | null | undefined;
    }, {
        type: "prueba" | "montaje" | "bolo" | "desmontaje";
        startsAt: string;
        endsAt: string;
        notes?: string | null | undefined;
    }>, {
        type: "prueba" | "montaje" | "bolo" | "desmontaje";
        startsAt: string;
        endsAt: string;
        notes?: string | null | undefined;
    }, {
        type: "prueba" | "montaje" | "bolo" | "desmontaje";
        startsAt: string;
        endsAt: string;
        notes?: string | null | undefined;
    }>, "many">>;
    logistics: z.ZodDefault<z.ZodObject<{
        departureAt: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        arrivalAt: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        returnAt: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        contactName: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        contactPhone: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        venuePhone: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        budgetCents: z.ZodNullable<z.ZodOptional<z.ZodNumber>>;
    }, "strip", z.ZodTypeAny, {
        departureAt?: string | null | undefined;
        arrivalAt?: string | null | undefined;
        returnAt?: string | null | undefined;
        contactName?: string | null | undefined;
        contactPhone?: string | null | undefined;
        venuePhone?: string | null | undefined;
        budgetCents?: number | null | undefined;
    }, {
        departureAt?: string | null | undefined;
        arrivalAt?: string | null | undefined;
        returnAt?: string | null | undefined;
        contactName?: string | null | undefined;
        contactPhone?: string | null | undefined;
        venuePhone?: string | null | undefined;
        budgetCents?: number | null | undefined;
    }>>;
    tags: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    assignments: z.ZodDefault<z.ZodArray<z.ZodEffects<z.ZodObject<{
        userId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        externalName: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        externalPhone: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        role: z.ZodEnum<["technician", "assembler", "driver", "pickup_teardown", "support", "lead"]>;
        segmentType: z.ZodNullable<z.ZodOptional<z.ZodEnum<["prueba", "montaje", "bolo", "desmontaje"]>>>;
        saveFreelance: z.ZodNullable<z.ZodOptional<z.ZodBoolean>>;
        personalNotes: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        departureAt: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        arrivalAt: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        logisticsNotes: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        role: "technician" | "assembler" | "driver" | "pickup_teardown" | "support" | "lead";
        departureAt?: string | null | undefined;
        arrivalAt?: string | null | undefined;
        userId?: string | null | undefined;
        externalName?: string | null | undefined;
        externalPhone?: string | null | undefined;
        segmentType?: "prueba" | "montaje" | "bolo" | "desmontaje" | null | undefined;
        saveFreelance?: boolean | null | undefined;
        personalNotes?: string | null | undefined;
        logisticsNotes?: string | null | undefined;
    }, {
        role: "technician" | "assembler" | "driver" | "pickup_teardown" | "support" | "lead";
        departureAt?: string | null | undefined;
        arrivalAt?: string | null | undefined;
        userId?: string | null | undefined;
        externalName?: string | null | undefined;
        externalPhone?: string | null | undefined;
        segmentType?: "prueba" | "montaje" | "bolo" | "desmontaje" | null | undefined;
        saveFreelance?: boolean | null | undefined;
        personalNotes?: string | null | undefined;
        logisticsNotes?: string | null | undefined;
    }>, {
        role: "technician" | "assembler" | "driver" | "pickup_teardown" | "support" | "lead";
        departureAt?: string | null | undefined;
        arrivalAt?: string | null | undefined;
        userId?: string | null | undefined;
        externalName?: string | null | undefined;
        externalPhone?: string | null | undefined;
        segmentType?: "prueba" | "montaje" | "bolo" | "desmontaje" | null | undefined;
        saveFreelance?: boolean | null | undefined;
        personalNotes?: string | null | undefined;
        logisticsNotes?: string | null | undefined;
    }, {
        role: "technician" | "assembler" | "driver" | "pickup_teardown" | "support" | "lead";
        departureAt?: string | null | undefined;
        arrivalAt?: string | null | undefined;
        userId?: string | null | undefined;
        externalName?: string | null | undefined;
        externalPhone?: string | null | undefined;
        segmentType?: "prueba" | "montaje" | "bolo" | "desmontaje" | null | undefined;
        saveFreelance?: boolean | null | undefined;
        personalNotes?: string | null | undefined;
        logisticsNotes?: string | null | undefined;
    }>, "many">>;
    forceConflicts: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    status: "pending" | "confirmed" | "cancelled" | "completed";
    title: string;
    startsAt: string;
    endsAt: string;
    city: string;
    venueName: string;
    segments: {
        type: "prueba" | "montaje" | "bolo" | "desmontaje";
        startsAt: string;
        endsAt: string;
        notes?: string | null | undefined;
    }[];
    logistics: {
        departureAt?: string | null | undefined;
        arrivalAt?: string | null | undefined;
        returnAt?: string | null | undefined;
        contactName?: string | null | undefined;
        contactPhone?: string | null | undefined;
        venuePhone?: string | null | undefined;
        budgetCents?: number | null | undefined;
    };
    tags: string[];
    assignments: {
        role: "technician" | "assembler" | "driver" | "pickup_teardown" | "support" | "lead";
        departureAt?: string | null | undefined;
        arrivalAt?: string | null | undefined;
        userId?: string | null | undefined;
        externalName?: string | null | undefined;
        externalPhone?: string | null | undefined;
        segmentType?: "prueba" | "montaje" | "bolo" | "desmontaje" | null | undefined;
        saveFreelance?: boolean | null | undefined;
        personalNotes?: string | null | undefined;
        logisticsNotes?: string | null | undefined;
    }[];
    forceConflicts: boolean;
    venueAddress?: string | null | undefined;
    venuePlaceId?: string | null | undefined;
    hotelName?: string | null | undefined;
    hotelAddress?: string | null | undefined;
    hotelPlaceId?: string | null | undefined;
    visibleNotes?: string | null | undefined;
    internalNotes?: string | null | undefined;
    gearNotes?: string | null | undefined;
}, {
    title: string;
    startsAt: string;
    endsAt: string;
    city: string;
    venueName: string;
    status?: "pending" | "confirmed" | "cancelled" | "completed" | undefined;
    venueAddress?: string | null | undefined;
    venuePlaceId?: string | null | undefined;
    hotelName?: string | null | undefined;
    hotelAddress?: string | null | undefined;
    hotelPlaceId?: string | null | undefined;
    visibleNotes?: string | null | undefined;
    internalNotes?: string | null | undefined;
    gearNotes?: string | null | undefined;
    segments?: {
        type: "prueba" | "montaje" | "bolo" | "desmontaje";
        startsAt: string;
        endsAt: string;
        notes?: string | null | undefined;
    }[] | undefined;
    logistics?: {
        departureAt?: string | null | undefined;
        arrivalAt?: string | null | undefined;
        returnAt?: string | null | undefined;
        contactName?: string | null | undefined;
        contactPhone?: string | null | undefined;
        venuePhone?: string | null | undefined;
        budgetCents?: number | null | undefined;
    } | undefined;
    tags?: string[] | undefined;
    assignments?: {
        role: "technician" | "assembler" | "driver" | "pickup_teardown" | "support" | "lead";
        departureAt?: string | null | undefined;
        arrivalAt?: string | null | undefined;
        userId?: string | null | undefined;
        externalName?: string | null | undefined;
        externalPhone?: string | null | undefined;
        segmentType?: "prueba" | "montaje" | "bolo" | "desmontaje" | null | undefined;
        saveFreelance?: boolean | null | undefined;
        personalNotes?: string | null | undefined;
        logisticsNotes?: string | null | undefined;
    }[] | undefined;
    forceConflicts?: boolean | undefined;
}>, {
    status: "pending" | "confirmed" | "cancelled" | "completed";
    title: string;
    startsAt: string;
    endsAt: string;
    city: string;
    venueName: string;
    segments: {
        type: "prueba" | "montaje" | "bolo" | "desmontaje";
        startsAt: string;
        endsAt: string;
        notes?: string | null | undefined;
    }[];
    logistics: {
        departureAt?: string | null | undefined;
        arrivalAt?: string | null | undefined;
        returnAt?: string | null | undefined;
        contactName?: string | null | undefined;
        contactPhone?: string | null | undefined;
        venuePhone?: string | null | undefined;
        budgetCents?: number | null | undefined;
    };
    tags: string[];
    assignments: {
        role: "technician" | "assembler" | "driver" | "pickup_teardown" | "support" | "lead";
        departureAt?: string | null | undefined;
        arrivalAt?: string | null | undefined;
        userId?: string | null | undefined;
        externalName?: string | null | undefined;
        externalPhone?: string | null | undefined;
        segmentType?: "prueba" | "montaje" | "bolo" | "desmontaje" | null | undefined;
        saveFreelance?: boolean | null | undefined;
        personalNotes?: string | null | undefined;
        logisticsNotes?: string | null | undefined;
    }[];
    forceConflicts: boolean;
    venueAddress?: string | null | undefined;
    venuePlaceId?: string | null | undefined;
    hotelName?: string | null | undefined;
    hotelAddress?: string | null | undefined;
    hotelPlaceId?: string | null | undefined;
    visibleNotes?: string | null | undefined;
    internalNotes?: string | null | undefined;
    gearNotes?: string | null | undefined;
}, {
    title: string;
    startsAt: string;
    endsAt: string;
    city: string;
    venueName: string;
    status?: "pending" | "confirmed" | "cancelled" | "completed" | undefined;
    venueAddress?: string | null | undefined;
    venuePlaceId?: string | null | undefined;
    hotelName?: string | null | undefined;
    hotelAddress?: string | null | undefined;
    hotelPlaceId?: string | null | undefined;
    visibleNotes?: string | null | undefined;
    internalNotes?: string | null | undefined;
    gearNotes?: string | null | undefined;
    segments?: {
        type: "prueba" | "montaje" | "bolo" | "desmontaje";
        startsAt: string;
        endsAt: string;
        notes?: string | null | undefined;
    }[] | undefined;
    logistics?: {
        departureAt?: string | null | undefined;
        arrivalAt?: string | null | undefined;
        returnAt?: string | null | undefined;
        contactName?: string | null | undefined;
        contactPhone?: string | null | undefined;
        venuePhone?: string | null | undefined;
        budgetCents?: number | null | undefined;
    } | undefined;
    tags?: string[] | undefined;
    assignments?: {
        role: "technician" | "assembler" | "driver" | "pickup_teardown" | "support" | "lead";
        departureAt?: string | null | undefined;
        arrivalAt?: string | null | undefined;
        userId?: string | null | undefined;
        externalName?: string | null | undefined;
        externalPhone?: string | null | undefined;
        segmentType?: "prueba" | "montaje" | "bolo" | "desmontaje" | null | undefined;
        saveFreelance?: boolean | null | undefined;
        personalNotes?: string | null | undefined;
        logisticsNotes?: string | null | undefined;
    }[] | undefined;
    forceConflicts?: boolean | undefined;
}>;
export declare const availabilityRequestSchema: z.ZodEffects<z.ZodObject<{
    startsAt: z.ZodString;
    endsAt: z.ZodString;
    reason: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    startsAt: string;
    endsAt: string;
    reason?: string | null | undefined;
}, {
    startsAt: string;
    endsAt: string;
    reason?: string | null | undefined;
}>, {
    startsAt: string;
    endsAt: string;
    reason?: string | null | undefined;
}, {
    startsAt: string;
    endsAt: string;
    reason?: string | null | undefined;
}>;
export declare const availabilityResolutionSchema: z.ZodObject<{
    status: z.ZodEnum<["approved", "rejected"]>;
    resolutionComment: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    status: "approved" | "rejected";
    resolutionComment?: string | null | undefined;
}, {
    status: "approved" | "rejected";
    resolutionComment?: string | null | undefined;
}>;
export declare const userCreateSchema: z.ZodObject<{
    name: z.ZodString;
    email: z.ZodString;
    phone: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    profileColor: z.ZodOptional<z.ZodString>;
    roleKeys: z.ZodArray<z.ZodString, "many">;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    password: string;
    name: string;
    email: string;
    roleKeys: string[];
    profileColor?: string | undefined;
    phone?: string | null | undefined;
}, {
    password: string;
    name: string;
    email: string;
    roleKeys: string[];
    profileColor?: string | undefined;
    phone?: string | null | undefined;
}>;
export declare const userUpdateSchema: z.ZodObject<{
    name: z.ZodString;
    email: z.ZodString;
    phone: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    profileColor: z.ZodOptional<z.ZodString>;
    roleKeys: z.ZodArray<z.ZodString, "many">;
    isActive: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    name: string;
    email: string;
    roleKeys: string[];
    isActive: boolean;
    profileColor?: string | undefined;
    phone?: string | null | undefined;
}, {
    name: string;
    email: string;
    roleKeys: string[];
    isActive: boolean;
    profileColor?: string | undefined;
    phone?: string | null | undefined;
}>;
export declare const rolePermissionsSchema: z.ZodObject<{
    permissionKeys: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    permissionKeys: string[];
}, {
    permissionKeys: string[];
}>;
export type EventInput = z.infer<typeof eventSchema>;
export type AvailabilityRequestInput = z.infer<typeof availabilityRequestSchema>;
