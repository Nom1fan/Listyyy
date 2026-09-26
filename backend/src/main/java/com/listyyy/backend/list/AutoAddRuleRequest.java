package com.listyyy.backend.list;

import lombok.Data;

import java.math.BigDecimal;

/** Upsert body for a list item's automatic replenishment rule. */
@Data
public class AutoAddRuleRequest {

    /** Amount of items to add on each run. */
    private BigDecimal quantity;
    /** Fire every {@code everyN} {@code everyUnit}. */
    private Integer everyN;
    /** One of DAYS, WEEKS, MONTHS, YEARS. */
    private String everyUnit;
    /** When false the rule is kept but the scheduler skips it. */
    private Boolean enabled;
}
