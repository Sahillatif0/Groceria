import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { UseAppContext } from "../../context/AppContext";

const AdminUsers = () => {
  const { axios, user: currentAdmin } = UseAppContext();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data } = await axios.get("/api/admin/users");
      if (data.success) {
        setUsers(data.users ?? []);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const toggleUserStatus = async (userId, isActive) => {
    if (!isActive && userId === currentAdmin?._id) {
      toast.error("You cannot deactivate your own account");
      return;
    }

    try {
      await axios.patch(`/api/admin/users/${userId}/status`, { isActive });
      toast.success(`User ${isActive ? "activated" : "deactivated"}`);
      fetchUsers();
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message);
    }
  };

  const deleteUser = async (userId) => {
    if (userId === currentAdmin?._id) {
      toast.error("You cannot delete your own account");
      return;
    }

    const confirmDelete = window.confirm(
      "This will deactivate the user account. Continue?"
    );
    if (!confirmDelete) return;

    try {
      await axios.delete(`/api/admin/users/${userId}`);
      toast.success("User updated");
      fetchUsers();
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message);
    }
  };

  return (
    <div className="p-6 md:p-10 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-sm text-gray-500">
          Manage customer, seller, and admin accounts.
        </p>
      </header>

      {loading ? (
        <p className="text-sm text-gray-500">Loading users…</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Name
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Email
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Role
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Status
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user._id}>
                  <td className="px-4 py-3">{user.name}</td>
                  <td className="px-4 py-3">{user.email}</td>
                  <td className="px-4 py-3 capitalize">{user.role}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        user.isActive
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {user.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button
                      onClick={() => toggleUserStatus(user._id, !user.isActive)}
                      className="rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50"
                    >
                      {user.isActive ? "Deactivate" : "Activate"}
                    </button>
                    {user.role !== "admin" && (
                      <button
                        onClick={() => deleteUser(user._id)}
                        className="rounded border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-sm text-gray-500"
                  >
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminUsers;
