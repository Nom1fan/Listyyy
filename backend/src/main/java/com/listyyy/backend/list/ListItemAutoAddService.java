package com.listyyy.backend.list;

import com.listyyy.backend.auth.User;
import com.listyyy.backend.exception.ResourceNotFoundException;
import com.listyyy.backend.notification.FcmService;
import com.listyyy.backend.productbank.Category;
import com.listyyy.backend.productbank.CategoryRepository;
import com.listyyy.backend.productbank.Product;
import com.listyyy.backend.productbank.ProductRepository;
import com.listyyy.backend.websocket.ListEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class ListItemAutoAddService {

    private static final String SYSTEM_DISPLAY_NAME = "הוספה אוטומטית";
    /** Note marker stamped on items the scheduler re-adds. */
    private static final String AUTO_ADDED_NOTE = "נוסף אוטומטית";

    private final ListItemAutoAddRuleRepository ruleRepository;
    private final ListItemRepository listItemRepository;
    private final ListAccessService listAccessService;
    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final FcmService fcmService;

    public Optional<ListItemAutoAddRule> getForItem(UUID listId, UUID itemId, User user) {
        ListItem item = getItemOrThrow(listId, itemId, user);
        return findRuleForItem(listId, item);
    }

    public List<ListItemAutoAddRule> listForList(UUID listId, User user) {
        listAccessService.getListOrThrow(listId, user);
        return ruleRepository.findByListId(listId);
    }

    @Transactional
    public ListItemAutoAddRule createForList(UUID listId, User user, AutoAddRuleCreateRequest req) {
        GroceryList list = listAccessService.getListOrThrow(listId, user);
        boolean hasProduct = req.getProductId() != null;
        boolean hasCustom = req.getCustomNameHe() != null && !req.getCustomNameHe().isBlank();
        if (hasProduct == hasCustom) {
            throw new IllegalArgumentException("יש לבחור פריט או להזין שם מותאם אישית");
        }
        BigDecimal quantity = req.getQuantity() != null ? req.getQuantity() : BigDecimal.ONE;
        validateQuantity(quantity);
        int everyN = validateEveryN(req.getEveryN());
        AutoAddUnit unit = AutoAddUnit.parse(req.getEveryUnit());
        boolean enabled = req.getEnabled() == null || req.getEnabled();

        ListItemAutoAddRule rule = ListItemAutoAddRule.builder().build();
        rule.setList(list);
        if (hasProduct) {
            Product product = productRepository.findById(req.getProductId())
                    .orElseThrow(() -> new ResourceNotFoundException("הפריט לא נמצא"));
            if (product.getCategory() == null || !product.getCategory().getWorkspace().getId().equals(list.getWorkspace().getId())) {
                throw new IllegalArgumentException("הפריט לא שייך למרחב העבודה של הרשימה");
            }
            if (ruleRepository.findByListIdAndProductId(listId, product.getId()).isPresent()) {
                throw new IllegalArgumentException("כבר מוגדרת הוספה אוטומטית לפריט זה");
            }
            rule.setProduct(product);
            rule.setUnit(product.getDefaultUnit() != null ? product.getDefaultUnit() : "יחידה");
            rule.setNote(product.getNote());
            rule.setIconId(product.getIconId());
            rule.setItemImageUrl(product.getImageUrl());
        } else {
            String name = req.getCustomNameHe().trim();
            if (ruleRepository.findByListIdAndCustomNameHe(listId, name).isPresent()) {
                throw new IllegalArgumentException("כבר מוגדרת הוספה אוטומטית לפריט זה");
            }
            rule.setCustomNameHe(name);
            rule.setUnit("יחידה");
            if (req.getCategoryId() != null) {
                Category category = categoryRepository.findById(req.getCategoryId())
                        .orElseThrow(() -> new ResourceNotFoundException("הקטגוריה לא נמצאה"));
                if (!category.getWorkspace().getId().equals(list.getWorkspace().getId())) {
                    throw new IllegalArgumentException("הקטגוריה לא שייכת למרחב העבודה של הרשימה");
                }
                rule.setCategory(category);
            }
        }
        rule.setQuantity(quantity);
        rule.setEveryN(everyN);
        rule.setEveryUnit(unit.name());
        rule.setEnabled(enabled);
        if (enabled) {
            rule.setNextRunAt(unit.addTo(Instant.now(), everyN));
        }
        return ruleRepository.save(rule);
    }

    @Transactional
    public ListItemAutoAddRule updateRule(UUID listId, UUID ruleId, User user, AutoAddRuleRequest req) {
        ListItemAutoAddRule rule = getRuleOrThrow(listId, ruleId, user);
        if (req.getQuantity() != null) {
            validateQuantity(req.getQuantity());
            rule.setQuantity(req.getQuantity());
        }
        if (req.getEveryN() != null || req.getEveryUnit() != null) {
            int everyN = req.getEveryN() != null ? req.getEveryN() : rule.getEveryN();
            if (everyN < 1 || everyN > 1000) {
                throw new IllegalArgumentException("תדירות חייבת להיות מספר בין 1 ל-1000");
            }
            AutoAddUnit unit = req.getEveryUnit() != null ? AutoAddUnit.parse(req.getEveryUnit()) : AutoAddUnit.parse(rule.getEveryUnit());
            rule.setEveryN(everyN);
            rule.setEveryUnit(unit.name());
        }
        if (req.getEnabled() != null) {
            rule.setEnabled(req.getEnabled());
        }
        if (rule.isEnabled()) {
            rule.setNextRunAt(AutoAddUnit.parse(rule.getEveryUnit()).addTo(Instant.now(), rule.getEveryN()));
        }
        return ruleRepository.save(rule);
    }

    @Transactional
    public void deleteRule(UUID listId, UUID ruleId, User user) {
        ruleRepository.delete(getRuleOrThrow(listId, ruleId, user));
    }

    private ListItemAutoAddRule getRuleOrThrow(UUID listId, UUID ruleId, User user) {
        listAccessService.getListOrThrow(listId, user);
        ListItemAutoAddRule rule = ruleRepository.findById(ruleId)
                .orElseThrow(() -> new ResourceNotFoundException("הכלל לא נמצא"));
        if (!rule.getList().getId().equals(listId)) {
            throw new ResourceNotFoundException("הכלל לא נמצא");
        }
        return rule;
    }

    private static void validateQuantity(BigDecimal quantity) {
        if (quantity == null || quantity.compareTo(BigDecimal.ZERO) <= 0 || quantity.compareTo(new BigDecimal("100000")) > 0) {
            throw new IllegalArgumentException("כמות להוספה חייבת להיות מספר חיובי");
        }
    }

    private static int validateEveryN(Integer everyN) {
        if (everyN == null || everyN < 1 || everyN > 1000) {
            throw new IllegalArgumentException("תדירות חייבת להיות מספר בין 1 ל-1000");
        }
        return everyN;
    }

    @Transactional
    public ListItemAutoAddRule upsertForItem(UUID listId, UUID itemId, User user, AutoAddRuleRequest req) {
        ListItem item = getItemOrThrow(listId, itemId, user);
        if (item.getProduct() == null && (item.getCustomNameHe() == null || item.getCustomNameHe().isBlank())) {
            throw new IllegalArgumentException("לא ניתן להגדיר הוספה אוטומטית לפריט זה");
        }

        boolean enabled = req.getEnabled() == null || req.getEnabled();
        BigDecimal quantity = req.getQuantity() != null ? req.getQuantity() : item.getQuantity();
        validateQuantity(quantity);

        AutoAddUnit unit;
        int everyN;
        Optional<ListItemAutoAddRule> existing = findRuleForItem(listId, item);
        if (existing.isPresent() && req.getEveryN() == null && req.getEveryUnit() == null) {
            unit = AutoAddUnit.parse(existing.get().getEveryUnit());
            everyN = existing.get().getEveryN();
        } else {
            everyN = validateEveryN(req.getEveryN());
            unit = AutoAddUnit.parse(req.getEveryUnit());
        }

        ListItemAutoAddRule rule = existing.orElseGet(() -> {
            ListItemAutoAddRule created = ListItemAutoAddRule.builder().build();
            created.setList(item.getList());
            if (item.getProduct() != null) {
                created.setProduct(item.getProduct());
            } else {
                created.setCustomNameHe(item.getCustomNameHe());
                created.setCategory(item.getCategory());
            }
            return created;
        });

        rule.setQuantity(quantity);
        rule.setUnit(item.getUnit() != null ? item.getUnit() : "יחידה");
        rule.setNote(item.getNote());
        rule.setIconId(item.getIconId());
        rule.setItemImageUrl(item.getItemImageUrl());
        rule.setEveryN(everyN);
        rule.setEveryUnit(unit.name());
        rule.setEnabled(enabled);
        if (enabled) {
            rule.setNextRunAt(unit.addTo(Instant.now(), everyN));
        }
        return ruleRepository.save(rule);
    }

    @Transactional
    public void deleteForItem(UUID listId, UUID itemId, User user) {
        ListItem item = getItemOrThrow(listId, itemId, user);
        findRuleForItem(listId, item).ifPresent(ruleRepository::delete);
    }

    /**
     * Fires due rules. A rule re-adds its item only when it is currently absent
     * from the list; otherwise the run is skipped and only the next fire time advances.
     */
    @Scheduled(fixedDelay = 600000)
    @Transactional
    public void processDueRules() {
        Instant now = Instant.now();
        List<ListItemAutoAddRule> due = ruleRepository.findByEnabledTrueAndNextRunAtLessThanEqual(now);
        for (ListItemAutoAddRule rule : due) {
            try {
                processOneRule(rule, now);
            } catch (Exception e) {
                log.warn("Failed to process auto-add rule {}", rule.getId(), e);
            }
        }
    }

    private void processOneRule(ListItemAutoAddRule rule, Instant now) {
        UUID listId = rule.getList().getId();
        if (rule.getProduct() != null) {
            Product product = productRepository.findById(rule.getProduct().getId()).orElse(null);
            if (product == null || product.getCategory() == null
                    || !product.getCategory().getWorkspace().getId().equals(rule.getList().getWorkspace().getId())) {
                ruleRepository.delete(rule);
                return;
            }
            if (!listItemRepository.existsByListIdAndProductId(listId, product.getId())) {
                ListItem item = ListItem.builder()
                        .list(rule.getList())
                        .product(product)
                        .quantity(rule.getQuantity())
                        .unit(rule.getUnit() != null ? rule.getUnit() : product.getDefaultUnit())
                        .note(withAutoAddedMarker(rule.getNote() != null ? rule.getNote() : product.getNote()))
                        .iconId(rule.getIconId())
                        .itemImageUrl(rule.getItemImageUrl())
                        .sortOrder(0)
                        .build();
                item = listItemRepository.save(item);
                announceAdded(listId, item);
            }
        } else {
            if (!listItemRepository.existsByListIdAndCustomNameHe(listId, rule.getCustomNameHe())) {
                Category category = rule.getCategory() != null && categoryRepository.existsById(rule.getCategory().getId())
                        ? rule.getCategory()
                        : null;
                ListItem item = ListItem.builder()
                        .list(rule.getList())
                        .customNameHe(rule.getCustomNameHe())
                        .category(category)
                        .quantity(rule.getQuantity())
                        .unit(rule.getUnit() != null ? rule.getUnit() : "יחידה")
                        .note(withAutoAddedMarker(rule.getNote()))
                        .iconId(rule.getIconId())
                        .itemImageUrl(rule.getItemImageUrl())
                        .sortOrder(0)
                        .build();
                item = listItemRepository.save(item);
                announceAdded(listId, item);
            }
        }
        AutoAddUnit unit = AutoAddUnit.parse(rule.getEveryUnit());
        Instant next = rule.getNextRunAt() != null ? rule.getNextRunAt() : now;
        int guard = 0;
        do {
            next = unit.addTo(next, rule.getEveryN());
            guard++;
        } while (!next.isAfter(now) && guard < 1000);
        rule.setNextRunAt(next);
        ruleRepository.save(rule);
    }

    /**
     * Stamps scheduler-added items so users can tell them apart. An existing note
     * is preserved with the marker appended; the marker is never duplicated.
     */
    private static String withAutoAddedMarker(String baseNote) {
        if (baseNote == null || baseNote.isBlank()) return AUTO_ADDED_NOTE;
        if (baseNote.contains(AUTO_ADDED_NOTE)) return baseNote;
        return baseNote + " · " + AUTO_ADDED_NOTE;
    }

    private void announceAdded(UUID listId, ListItem item) {
        ListEvent event = ListEvent.builder()
                .type(ListEvent.Type.ADDED)
                .listId(listId)
                .itemId(item.getId())
                .itemDisplayName(item.getDisplayName())
                .quantityUnit(item.getQuantity() + " " + item.getUnit())
                .userId(null)
                .userDisplayName(SYSTEM_DISPLAY_NAME)
                .build();
        messagingTemplate.convertAndSend("/topic/lists/" + listId, event);
        fcmService.notifyListUpdated(listId, null, "Listyyy",
                SYSTEM_DISPLAY_NAME + ": " + item.getDisplayName() + " " + item.getQuantity() + " " + item.getUnit());
    }

    private Optional<ListItemAutoAddRule> findRuleForItem(UUID listId, ListItem item) {
        if (item.getProduct() != null) {
            return ruleRepository.findByListIdAndProductId(listId, item.getProduct().getId());
        }
        if (item.getCustomNameHe() != null) {
            return ruleRepository.findByListIdAndCustomNameHe(listId, item.getCustomNameHe());
        }
        return Optional.empty();
    }

    private ListItem getItemOrThrow(UUID listId, UUID itemId, User user) {
        listAccessService.getListOrThrow(listId, user);
        ListItem item = listItemRepository.findById(itemId)
                .orElseThrow(() -> new ResourceNotFoundException("הפריט לא נמצא"));
        if (!item.getList().getId().equals(listId)) throw new IllegalArgumentException("הפריט לא שייך לרשימה");
        return item;
    }
}
