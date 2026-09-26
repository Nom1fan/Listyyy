package com.listyyy.backend.list;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Data
@Builder
public class AutoAddRuleResponse {

    private UUID id;
    private UUID listId;
    private UUID productId;
    private String customNameHe;
    private BigDecimal quantity;
    private String unit;
    private int everyN;
    private String everyUnit;
    private boolean enabled;
    private Instant nextRunAt;
    /** Optimistic-locking version. */
    private Long version;
}
