// @ts-check
import { test, expect } from '@playwright/test';

test.describe('Authentication Flows', () => {
  test.beforeEach(async ({ page }) => {
    // Go to the home page (which should be the login page if not authenticated)
    await page.goto('/');
  });

  test('should allow a user to log in successfully', async ({ page }) => {
    // Fill in the email and password
    await page.getByPlaceholder('Email').fill('test@example.com'); // Use a known test user
    await page.getByPlaceholder('Password').fill('correctpassword'); // Use the correct password

    // Click the Sign In button
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Wait for navigation to the chat page or for a welcome message
    // This assertion depends on what appears after login.
    // Assuming a welcome message with the username appears in the chat header.
    // The mock user from __mocks__/supabaseClient.js is 'TestUser' for 'test@example.com'
    await expect(page.getByText('Welcome, TestUser!')).toBeVisible({ timeout: 10000 });
    // Or check for URL change if applicable: await expect(page).toHaveURL('/chat');
  });

  test('should show an error message for failed login', async ({ page }) => {
    await page.getByPlaceholder('Email').fill('test@example.com');
    await page.getByPlaceholder('Password').fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Check for an error message
    await expect(page.getByText('Error: Invalid login credentials')).toBeVisible();
  });

  test('should allow a user to log out', async ({ page }) => {
    // First, log in the user
    await page.getByPlaceholder('Email').fill('test@example.com');
    await page.getByPlaceholder('Password').fill('correctpassword');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByText('Welcome, TestUser!')).toBeVisible({ timeout: 10000 });

    // Click the Logout button
    // Assuming the logout button is identifiable by role and name
    await page.getByRole('button', { name: 'Logout' }).click();

    // After logout, user should be redirected to the login page
    // Check for an element that is unique to the login page
    await expect(page.getByPlaceholder('Email')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });

  // Test Sign Up (Optional, as it might require email confirmation in a real app)
  // For a mock environment or if auto-confirmation is on, this can be tested.
  test('should allow a new user to sign up', async ({ page }) => {
    await page.getByRole('button', { name: 'Need an account? Sign Up' }).click();

    // Fill registration form
    const uniqueEmail = `newuser_${Date.now()}@example.com`;
    await page.getByPlaceholder('Email').fill(uniqueEmail);
    await page.getByPlaceholder('Password').fill('newpassword123');

    // Click Sign Up button
    await page.getByRole('button', { name: 'Sign Up' }).click();

    // Check for success message
    // The LoginPage shows "Sign up successful! Please check your email to confirm."
    await expect(page.getByText(/Sign up successful!/i)).toBeVisible();

    // Optional: Verify redirection or state (e.g., back to login with a message)
    // For now, just checking the message is fine.
  });

});
