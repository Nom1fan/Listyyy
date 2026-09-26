package com.listyyy.backend;

import com.listyyy.backend.auth.EmailOtpRepository;
import com.listyyy.backend.auth.PhoneOtpRepository;
import com.listyyy.backend.auth.RefreshTokenRepository;
import com.listyyy.backend.auth.User;
import com.listyyy.backend.auth.UserRepository;
import com.listyyy.backend.list.GroceryListRepository;
import com.listyyy.backend.list.ListItemAutoAddRuleRepository;
import com.listyyy.backend.list.ListItemRepository;
import com.listyyy.backend.productbank.Category;
import com.listyyy.backend.productbank.CategoryRepository;
import com.listyyy.backend.productbank.Product;
import com.listyyy.backend.productbank.ProductRepository;
import com.listyyy.backend.workspace.Workspace;
import com.listyyy.backend.workspace.WorkspaceInvitationRepository;
import com.listyyy.backend.workspace.WorkspaceMember;
import com.listyyy.backend.workspace.WorkspaceMemberRepository;
import com.listyyy.backend.workspace.WorkspaceRepository;
import com.listyyy.backend.auth.EmailService;
import com.listyyy.backend.auth.SmsService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public abstract class AbstractIntegrationTest {

    @Autowired
    protected MockMvc mvc;
    @Autowired
    protected ObjectMapper objectMapper;
    @MockBean
    protected SmsService smsService;
    @MockBean
    protected EmailService emailService;
    @Autowired
    protected UserRepository userRepository;
    @Autowired
    protected PasswordEncoder passwordEncoder;
    @Autowired
    protected CategoryRepository categoryRepository;
    @Autowired
    protected ProductRepository productRepository;
    @Autowired
    protected PhoneOtpRepository phoneOtpRepository;
    @Autowired
    protected EmailOtpRepository emailOtpRepository;
    @Autowired
    protected ListItemRepository listItemRepository;
    @Autowired
    protected ListItemAutoAddRuleRepository autoAddRuleRepository;
    @Autowired
    protected GroceryListRepository listRepository;
    @Autowired
    protected RefreshTokenRepository refreshTokenRepository;
    @Autowired
    protected WorkspaceRepository workspaceRepository;
    @Autowired
    protected WorkspaceMemberRepository workspaceMemberRepository;
    @Autowired
    protected WorkspaceInvitationRepository workspaceInvitationRepository;

    protected String authToken;
    protected User testUser;
    protected UUID workspaceId;
    protected UUID categoryId;
    protected UUID productId;

    @BeforeEach
    void baseSetUp() throws Exception {
        autoAddRuleRepository.deleteAll();
        listItemRepository.deleteAll();
        listRepository.deleteAll();
        phoneOtpRepository.deleteAll();
        emailOtpRepository.deleteAll();
        refreshTokenRepository.deleteAll();
        productRepository.deleteAll();
        categoryRepository.deleteAll();
        workspaceInvitationRepository.deleteAll();
        workspaceMemberRepository.deleteAll();
        workspaceRepository.deleteAll();
        userRepository.deleteAll();

        testUser = User.builder()
                .email("test@example.com")
                .passwordHash(passwordEncoder.encode("password123"))
                .displayName("Test User")
                .locale("he")
                .build();
        testUser = userRepository.save(testUser);

        // Create default workspace for test user
        Workspace workspace = Workspace.builder()
                .name("הרשימות שלי")
                .build();
        workspace = workspaceRepository.save(workspace);
        workspaceId = workspace.getId();
        workspaceMemberRepository.save(WorkspaceMember.builder()
                .workspaceId(workspace.getId())
                .userId(testUser.getId())
                .workspace(workspace)
                .user(testUser)
                .role("owner")
                .build());

        authToken = login("test@example.com", "password123");

        Category cat = Category.builder()
                .workspace(workspace)
                .nameHe("מכולת")
                .iconId("groceries")
                .sortOrder(0)
                .build();
        cat = categoryRepository.save(cat);
        categoryId = cat.getId();

        Product product = Product.builder()
                .category(cat)
                .nameHe("אורז")
                .defaultUnit("קילו")
                .build();
        product = productRepository.save(product);
        productId = product.getId();
    }

    protected String login(String email, String password) throws Exception {
        ResultActions result = mvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                        java.util.Map.of("email", email, "password", password))))
                .andExpect(status().isOk());
        String body = result.andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get("token").asText();
    }

    protected String getBearerToken() {
        return "Bearer " + authToken;
    }
}
