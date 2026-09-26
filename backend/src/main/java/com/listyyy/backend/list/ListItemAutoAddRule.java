package com.listyyy.backend.list;

import com.listyyy.backend.productbank.Category;
import com.listyyy.backend.productbank.Product;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Recurring replenishment rule for a single list entry. The rule survives
 * deletion of the list item itself: when {@code nextRunAt} arrives the scheduler
 * re-adds the item only if it is currently absent from the list, otherwise it skips.
 */
@Entity
@Table(name = "list_item_auto_add_rules")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ListItemAutoAddRule {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "list_id", nullable = false)
    private GroceryList list;

    /** Product to re-add; mutually exclusive with {@code customNameHe}. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_id")
    private Product product;

    /** Custom item name to re-add when no product is linked. */
    @Column(name = "custom_name_he")
    private String customNameHe;

    /** Category snapshot for custom items (null = category-less). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "category_id")
    private Category category;

    /** Amount of items to add on each run. */
    @Column(nullable = false, precision = 12, scale = 3)
    @Builder.Default
    private BigDecimal quantity = BigDecimal.ONE;

    /** Item unit snapshot used when re-adding. */
    @Column(length = 50)
    @Builder.Default
    private String unit = "יחידה";

    @Column(columnDefinition = "TEXT")
    private String note;

    @Column(name = "icon_id", length = 64)
    private String iconId;

    @Column(name = "item_image_url", length = 2048)
    private String itemImageUrl;

    /** Fire every {@code everyN} {@code everyUnit}. */
    @Column(name = "every_n", nullable = false)
    private int everyN;

    @Column(name = "every_unit", nullable = false, length = 20)
    private String everyUnit;

    @Column(nullable = false)
    @Builder.Default
    private boolean enabled = true;

    @Column(name = "next_run_at")
    private Instant nextRunAt;

    @Version
    private Long version;

    @CreationTimestamp
    @Column(name = "created_at")
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private Instant updatedAt;
}
