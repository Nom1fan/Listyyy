package com.listyyy.backend.list;

import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

/** Recurrence unit for automatic list-item replenishment. */
public enum AutoAddUnit {

    DAYS,
    WEEKS,
    MONTHS,
    YEARS;

    /** Time zone whose mornings the rules fire in. */
    public static final ZoneId ZONE = ZoneId.of("Asia/Jerusalem");
    /** Wall-clock time of day the rules fire at. */
    public static final LocalTime FIRE_TIME = LocalTime.of(8, 0);

    /**
     * Returns 08:00 on the day {@code amount} of this unit after {@code base},
     * regardless of the time of day of {@code base}.
     */
    public Instant addTo(Instant base, int amount) {
        ZonedDateTime zoned = base.atZone(ZONE);
        ZonedDateTime shifted = switch (this) {
            case DAYS -> zoned.plusDays(amount);
            case WEEKS -> zoned.plusWeeks(amount);
            case MONTHS -> zoned.plusMonths(amount);
            case YEARS -> zoned.plusYears(amount);
        };
        return shifted.toLocalDate().atTime(FIRE_TIME).atZone(ZONE).toInstant();
    }

    public static AutoAddUnit parse(String value) {
        if (value == null) throw new IllegalArgumentException("יש לבחור יחידת זמן");
        try {
            return AutoAddUnit.valueOf(value.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("יחידת זמן לא נתמכת");
        }
    }
}
