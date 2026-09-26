package com.listyyy.backend.productbank;

import com.listyyy.backend.auth.User;
import com.listyyy.backend.exception.AccessDeniedException;
import com.listyyy.backend.exception.ResourceNotFoundException;
import com.listyyy.backend.exception.VersionCheck;
import com.listyyy.backend.list.ListItemAutoAddRuleRepository;
import com.listyyy.backend.list.ListItemRepository;
import com.listyyy.backend.websocket.WorkspaceEvent;
import com.listyyy.backend.websocket.WorkspaceEventPublisher;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/products")
@RequiredArgsConstructor
public class ProductController {

    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;
    private final CategoryAccessService categoryAccessService;
    private final ListItemRepository listItemRepository;
    private final ListItemAutoAddRuleRepository autoAddRuleRepository;
    private final WorkspaceEventPublisher workspaceEventPublisher;

    @GetMapping
    public ResponseEntity<List<ProductDto>> list(
            @RequestParam(required = false) UUID categoryId,
            @RequestParam(required = false) String search,
            @AuthenticationPrincipal User user
    ) {
        if (user == null) return ResponseEntity.status(401).build();
        Set<UUID> visibleCategoryIds = categoryRepository.findVisibleToUser(user.getId())
                .stream().map(c -> c.getId()).collect(Collectors.toSet());
        List<Product> products;
        if (search != null && !search.isBlank()) {
            String trimmedSearch = search.trim();
            products = productRepository.findByNameHeContainingIgnoreCaseOrSectionNameHeContainingIgnoreCase(trimmedSearch, trimmedSearch);
            products = products.stream().filter(p -> visibleCategoryIds.contains(p.getCategory().getId())).toList();
        } else if (categoryId != null) {
            if (!visibleCategoryIds.contains(categoryId)) throw new AccessDeniedException("אין גישה לקטגוריה");
            products = productRepository.findByCategoryIdOrderByNameHe(categoryId);
        } else {
            products = productRepository.findByCategory_IdIn(visibleCategoryIds, Sort.by("nameHe"));
        }
        Map<UUID, Long> addCountByProduct = getProductAddCounts();
        List<ProductDto> body = products.stream()
                .map(p -> toDto(p, addCountByProduct.getOrDefault(p.getId(), 0L)))
                .sorted((a, b) -> {
                    int cmp = Long.compare(b.getAddCount(), a.getAddCount());
                    return cmp != 0 ? cmp : a.getNameHe().compareTo(b.getNameHe());
                })
                .toList();
        return ResponseEntity.ok(body);
    }

    @GetMapping("/{id}")
    public ResponseEntity<ProductDto> get(@PathVariable UUID id, @AuthenticationPrincipal User user) {
        if (user == null) return ResponseEntity.status(401).build();
        Product p = productRepository.findById(id).orElseThrow(() -> new ResourceNotFoundException("הפריט לא נמצא"));
        categoryAccessService.getCategoryOrThrow(p.getCategory().getId(), user);
        Map<UUID, Long> addCountByProduct = getProductAddCounts();
        return ResponseEntity.ok(toDto(p, addCountByProduct.getOrDefault(p.getId(), 0L)));
    }

    @PostMapping
    public ResponseEntity<ProductDto> create(
            @Valid @RequestBody CreateProductRequest req,
            @AuthenticationPrincipal User user
    ) {
        if (user == null) return ResponseEntity.status(401).build();
        var category = categoryAccessService.getCategoryOrThrow(req.getCategoryId(), user);
        if (!categoryAccessService.canEdit(user, req.getCategoryId())) throw new AccessDeniedException("לא ניתן להוסיף פריט לקטגוריה זו");
        String trimmedName = req.getNameHe().trim();
        if (productRepository.existsByCategoryIdAndNameHe(req.getCategoryId(), trimmedName)) {
            throw new IllegalArgumentException("כבר קיים פריט בשם זה בקטגוריה");
        }
        String unit = req.getDefaultUnit() != null && !req.getDefaultUnit().isBlank()
                ? req.getDefaultUnit().trim() : "יחידה";
        String iconId = req.getIconId() != null && !req.getIconId().isBlank() ? req.getIconId().trim() : null;
        String imageUrl = req.getImageUrl() != null && !req.getImageUrl().isBlank() ? req.getImageUrl().trim() : null;
        String note = req.getNote() != null && !req.getNote().isBlank() ? req.getNote().trim() : null;
        String sectionNameHe = normalizeOptionalText(req.getSectionNameHe());
        Product p = Product.builder()
                .category(category)
                .nameHe(trimmedName)
                .defaultUnit(unit)
                .iconId(iconId)
                .imageUrl(imageUrl)
                .note(note)
                .sectionNameHe(sectionNameHe)
                .build();
        p = productRepository.save(p);
        workspaceEventPublisher.publish(category.getWorkspace().getId(), WorkspaceEvent.EntityType.PRODUCT,
                WorkspaceEvent.Action.CREATED, p.getId(), p.getNameHe(), user);
        return ResponseEntity.ok(toDto(p, 0L));
    }

    @DeleteMapping("/{id}")
    @Transactional
    public ResponseEntity<Void> delete(
            @PathVariable UUID id,
            @AuthenticationPrincipal User user
    ) {
        if (user == null) return ResponseEntity.status(401).build();
        Product p = productRepository.findById(id).orElseThrow(() -> new ResourceNotFoundException("הפריט לא נמצא"));
        categoryAccessService.getCategoryOrThrow(p.getCategory().getId(), user);
        if (!categoryAccessService.canEdit(user, p.getCategory().getId())) throw new AccessDeniedException("אין גישה");
        UUID wsId = p.getCategory().getWorkspace().getId();
        String name = p.getNameHe();
        // Remove any list items referencing this product before deleting,
        // to avoid violating the name_from_product_or_custom check constraint.
        listItemRepository.deleteByProductId(id);
        autoAddRuleRepository.deleteByProductId(id);
        productRepository.delete(p);
        workspaceEventPublisher.publish(wsId, WorkspaceEvent.EntityType.PRODUCT,
                WorkspaceEvent.Action.DELETED, id, name, user);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{id}")
    @Transactional
    public ResponseEntity<ProductDto> update(
            @PathVariable UUID id,
            @AuthenticationPrincipal User user,
            @RequestBody UpdateProductRequest req
    ) {
        if (user == null) return ResponseEntity.status(401).build();
        Product p = productRepository.findById(id).orElseThrow(() -> new ResourceNotFoundException("הפריט לא נמצא"));
        categoryAccessService.getCategoryOrThrow(p.getCategory().getId(), user);
        if (!categoryAccessService.canEdit(user, p.getCategory().getId())) throw new AccessDeniedException("אין גישה");
        VersionCheck.check(req.getVersion(), p.getVersion());
        // nameHe: set when provided and not blank
        if (req.getNameHe() != null && !req.getNameHe().isBlank()) {
            String trimmedName = req.getNameHe().trim();
            if (!trimmedName.equals(p.getNameHe()) && productRepository.existsByCategoryIdAndNameHeAndIdNot(p.getCategory().getId(), trimmedName, p.getId())) {
                throw new IllegalArgumentException("כבר קיים פריט בשם זה בקטגוריה");
            }
            p.setNameHe(trimmedName);
        }
        // defaultUnit: set when provided and not blank
        if (req.getDefaultUnit() != null && !req.getDefaultUnit().isBlank()) p.setDefaultUnit(req.getDefaultUnit().trim());
        // imageUrl: set when provided; use empty string in request to clear
        if (req.getImageUrl() != null) p.setImageUrl(req.getImageUrl().isBlank() ? null : req.getImageUrl());
        // iconId: set when provided; use empty string in request to clear override
        if (req.getIconId() != null) p.setIconId(req.getIconId().isBlank() ? null : req.getIconId());
        // note: set when provided; use empty string in request to clear
        if (req.getNote() != null) p.setNote(req.getNote().isBlank() ? null : req.getNote().trim());
        // sectionNameHe: set when provided; use empty string in request to clear
        if (req.getSectionNameHe() != null) p.setSectionNameHe(normalizeOptionalText(req.getSectionNameHe()));
        // categoryId: move product to a different category
        if (req.getCategoryId() != null && !req.getCategoryId().equals(p.getCategory().getId())) {
            Category newCategory = categoryAccessService.getCategoryOrThrow(req.getCategoryId(), user);
            if (!categoryAccessService.canEdit(user, req.getCategoryId())) throw new AccessDeniedException("אין גישה לקטגוריה היעד");
            if (!newCategory.getWorkspace().getId().equals(p.getCategory().getWorkspace().getId())) {
                throw new IllegalArgumentException("הקטגוריה לא שייכת לאותו מרחב עבודה");
            }
            if (productRepository.existsByCategoryIdAndNameHeAndIdNot(req.getCategoryId(), p.getNameHe(), p.getId())) {
                throw new IllegalArgumentException("כבר קיים פריט בשם זה בקטגוריה היעד");
            }
            p.setCategory(newCategory);
        }
        p = productRepository.save(p);
        workspaceEventPublisher.publish(p.getCategory().getWorkspace().getId(), WorkspaceEvent.EntityType.PRODUCT,
                WorkspaceEvent.Action.UPDATED, p.getId(), p.getNameHe(), user);
        return ResponseEntity.ok(toDto(p, getProductAddCounts().getOrDefault(p.getId(), 0L)));
    }

    private Map<UUID, Long> getProductAddCounts() {
        return listItemRepository.countByProductId().stream()
                .collect(Collectors.toMap(
                        row -> toUuid(row[0]),
                        row -> ((Number) row[1]).longValue()
                ));
    }

    private static UUID toUuid(Object o) {
        if (o instanceof UUID) return (UUID) o;
        if (o instanceof byte[]) {
            java.nio.ByteBuffer bb = java.nio.ByteBuffer.wrap((byte[]) o);
            return new UUID(bb.getLong(), bb.getLong());
        }
        return UUID.fromString(o.toString());
    }

    private static String normalizeOptionalText(String value) {
        if (value == null || value.isBlank()) return null;
        return value.trim();
    }

    private ProductDto toDto(Product p, long addCount) {
        return ProductDto.builder()
                .id(p.getId())
                .categoryId(p.getCategory().getId())
                .categoryNameHe(p.getCategory().getNameHe())
                .categoryIconId(p.getCategory().getIconId())
                .iconId(p.getIconId())
                .nameHe(p.getNameHe())
                .defaultUnit(p.getDefaultUnit())
                .imageUrl(p.getImageUrl())
                .note(p.getNote())
                .sectionNameHe(p.getSectionNameHe())
                .addCount(addCount)
                .version(p.getVersion())
                .build();
    }
}
